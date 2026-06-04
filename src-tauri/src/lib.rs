use all_smi::AllSmi;
use hwlocality::object::attributes::ObjectAttributes;
use hwlocality::{object::types::ObjectType, Topology};
use serde::{Deserialize, Serialize};
use serde_json::{Map, Value};
use std::fs::{self, File};
use std::io::{BufReader, Write};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::Duration;
use sysinfo::{Components, Process, System};
use tauri::{Emitter, Manager, State};

#[cfg(target_os = "macos")]
use macmon::Sampler;

#[derive(Serialize, Clone, Deserialize)]
struct Config {
    graph_grad: bool,
    card_colour: bool,
    brit: bool,
    on_top: bool,
}

struct AppState {
    base: Mutex<UpdatePayload>,
    sys: Mutex<System>,
    comp: Mutex<Components>,
    config: Mutex<Option<Config>>,
    app_dir: String,
    info_type: Mutex<u32>,
    smi: AllSmi,
    base_gpu: GPUPayload,
}

#[derive(Serialize, Clone)]
struct CPUInfo {
    name: String,
    cores: u32,
    threads: u32,
    util: f32,
    temp: f32,
    freq: f32,
}

#[derive(Serialize, Clone)]
struct SystemInfo {
    name: String,
    os: String,
    version: String,
    uptime: String,
    processes: u32,
    swap: f32,
    variance: f32,
    load: f32,
}

#[derive(Serialize, Clone)]
struct ProcessInfo {
    name: String,
    util: f32,
    pid: u32,
}

#[derive(Serialize, Clone)]
struct UpdatePayload {
    cpu: CPUInfo,
    threads: Vec<Thread>,
    system: SystemInfo,
    top: Vec<ProcessInfo>,
}

#[derive(Serialize, Clone, Debug)]
struct GPUPayload {
    util: f32,
    vu: f32,
    vt: f32,
    temp: f32,
    name: String,
    hname: String,
    freq: f32,
    power: f32,
    cores: u32,
}

#[derive(Serialize, Clone)]
struct Thread {
    name: String,
    util: f32,
    freq: f32,
    l1: u64,
    l2: u64,
    perf: bool,
    os: u32,
}

fn format_time(secs: u64) -> String {
    let days = secs / 86400;
    let hours = (secs % 86400) / 3600;
    let mins = (secs % 3600) / 60;
    match (days, hours, mins) {
        (d, _, _) if d > 0 => format!("{}d {}h", d, hours),
        (_, h, _) if h > 0 => format!("{}h {}m", h, mins),
        _ => format!("{}m", mins),
    }
}

// ADD GLOBAL CONTEXT SWITCHES LATER !!!

const KW: [&str; 6] = [
    "tdie",         // AMD (Zen)
    "tctl",         // AMD legacy
    "package id 0", // Intel
    "cpu thermal",  // macOS / Linux generic
    "k10temp",      // AMD kernel (Linux)
    "coretemp",     // Intel kernel (Linux)
];

fn update_threads(sys: &mut System, base: &Vec<Thread>) -> Result<Vec<Thread>, String> {
    let out: Vec<Thread> = sys
        .cpus()
        .iter()
        .enumerate()
        .map(|(n, thread)| {
            let util = thread.cpu_usage();
            let freq = thread.frequency() as f32 / 1000.0;
            let name = thread.name().to_string();
            Thread {
                name,
                util,
                freq,
                l1: base[n].l1,
                l2: base[n].l2,
                perf: base[n].perf,
                os: base[n].os.clone(),
            }
        })
        .collect();
    Ok(out)
}

fn update_info(state: &AppState) -> Result<UpdatePayload, String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    let base = state.base.lock().map_err(|e| e.to_string())?;

    if base.threads.is_empty() {
        return Err("not yet initialised".to_string());
    }

    sys.refresh_cpu_usage();
    sys.refresh_cpu_frequency();

    let cpu = update_cpu(state, &mut sys, &base)?;
    let threads = update_threads(&mut sys, &base.threads)?;

    let mut system = base.system.clone();
    system.uptime = format_time(System::uptime());
    system.swap = (sys.used_swap() as f32) * 0.000000001;
    system.load = System::load_average().one as f32;

    let mut cpu_iter = sys.cpus().iter();
    let (min, max) = if let Some(first_cpu) = cpu_iter.next() {
        let mut min = first_cpu.cpu_usage();
        let mut max = min;
        for cpu in cpu_iter {
            let usage = cpu.cpu_usage();
            if usage < min {
                min = usage;
            }
            if usage > max {
                max = usage;
            }
        }
        (min, max)
    } else {
        (0.0, 0.0)
    };
    system.variance = max - min;

    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut p: Vec<&Process> = sys.processes().values().collect();
    system.processes = p.len() as u32;
    p.sort_by(|a, b| b.cpu_usage().total_cmp(&a.cpu_usage()));

    // Local::now().format("%H:%M:%S").to_string()

    Ok(UpdatePayload {
        cpu,
        threads,
        system,
        top: p
            .into_iter()
            .take(4)
            .map(|pr| ProcessInfo {
                name: pr.name().to_str().unwrap_or("Unknown").to_string(),
                util: pr.cpu_usage(),
                pid: pr.pid().as_u32(),
            })
            .collect(),
    })
}

fn update_cpu(state: &AppState, sys: &mut System, base: &UpdatePayload) -> Result<CPUInfo, String> {
    let util = sys.global_cpu_usage();

    let freq = sys.cpus().iter().map(|c| c.frequency()).max().unwrap_or(0) as f32 / 1000.0;

    let mut comp = state.comp.lock().map_err(|e| e.to_string())?;
    comp.refresh(false);

    let mut temp = -100.0;
    for c in comp.list() {
        let label = c.label().to_lowercase();
        if KW.iter().any(|&k| label.contains(k)) {
            if let Some(c_temp) = c.temperature() {
                if c_temp > temp {
                    temp = c_temp;
                }
            }
        }
    }

    let base: &CPUInfo = &base.cpu;
    Ok(CPUInfo {
        name: base.name.clone(),
        cores: base.cores,
        threads: base.threads,
        util,
        temp,
        freq,
    })
}

#[cfg(target_os = "macos")]
fn get_core_kinds() -> u32 {
    let output = std::process::Command::new("sysctl")
        .arg("-n")
        .arg("hw.perflevel0.logicalcpu")
        .output()
        .ok();
    if let Some(out) = output {
        String::from_utf8_lossy(&out.stdout)
            .trim()
            .parse()
            .unwrap_or(999)
    } else {
        999
    }
}

#[cfg(target_os = "macos")]
fn build_core_kinds(n: u32) -> Vec<bool> {
    let p_count = get_core_kinds();
    (0..n)
        .map(|c| if c < (n - p_count) { false } else { true })
        .collect()
}

#[tauri::command]
fn fetch_info(state: State<'_, AppState>) -> Result<UpdatePayload, String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;
    sys.refresh_all();
    let name = sys
        .cpus()
        .first()
        .map(|c| c.brand().to_string())
        .unwrap_or_else(|| "Unknown CPU".to_string());

    let kinds: Vec<bool>;
    #[cfg(target_os = "macos")]
    {
        kinds = build_core_kinds(sys.cpus().len() as u32);
    }
    #[cfg(not(target_os = "macos"))]
    {
        kinds = Vec::new();
    }

    let some_top = Topology::new();
    let base_threads: Vec<Thread> = if let Ok(top) = some_top {
        top.objects_with_type(ObjectType::PU)
            .map(|pu| {
                let os = pu.os_index().unwrap_or(0) as u32;
                let mut l1 = 0;
                let mut l2 = 0;

                let mut perf = true;
                let mut c = pu.parent();
                while let Some(parent) = c {
                    if parent.object_type() == ObjectType::Core {
                        #[cfg(target_os = "macos")]
                        {
                            if let Some(idx) = pu.os_index() {
                                perf = kinds.get(idx).copied().unwrap_or(true);
                            }
                        }
                        #[cfg(not(target_os = "macos"))]
                        {
                            perf = parent.subtype() == Some(c"IntelCore");
                        }
                    }
                    if let Some(ObjectAttributes::Cache(cache)) = parent.attributes() {
                        let size = cache.size().map(|s| s.get() / 1024).unwrap_or(0);
                        match parent.object_type() {
                            ObjectType::L1Cache => l1 += size,
                            ObjectType::L2Cache => l2 = size,
                            _ => {}
                        }
                    }
                    c = parent.parent();
                }

                Thread {
                    name: "N/A".to_string(),
                    freq: 0.0,
                    util: 0.0,
                    l1,
                    l2,
                    perf,
                    os,
                }
            })
            .collect()
    } else {
        sys.cpus()
            .iter()
            .map(|_| Thread {
                name: "N/A".to_string(),
                freq: 0.0,
                util: 0.0,
                l1: 0,
                l2: 0,
                perf: true,
                os: 0,
            })
            .collect()
    };

    let mut base = state.base.lock().map_err(|e| e.to_string())?;
    let mut cpu = update_cpu(&state, &mut sys, &base)?;
    let threads = update_threads(&mut sys, &base_threads)?;

    cpu.name = name.clone();
    cpu.cores = System::physical_core_count().unwrap_or_else(|| 0) as u32;
    cpu.threads = sys.cpus().len() as u32;
    base.cpu = cpu.clone();
    base.threads = base_threads;

    sys.refresh_processes(sysinfo::ProcessesToUpdate::All, true);

    let mut p: Vec<&Process> = sys.processes().values().collect();
    p.sort_by(|a, b| b.cpu_usage().total_cmp(&a.cpu_usage()));

    Ok(UpdatePayload {
        cpu,
        threads,
        system: base.system.clone(),
        top: p
            .into_iter()
            .take(4)
            .map(|pr| ProcessInfo {
                name: pr.name().to_str().unwrap_or("Unknown").to_string(),
                util: pr.cpu_usage(),
                pid: pr.pid().as_u32(),
            })
            .collect(),
    })
}

#[cfg(target_os = "macos")]
fn get_computer_name() -> String {
    std::process::Command::new("scutil")
        .arg("--get")
        .arg("ComputerName")
        .output()
        .ok()
        .and_then(|o| String::from_utf8(o.stdout).ok())
        .map(|s| s.trim().to_string())
        .unwrap_or_else(|| System::host_name().unwrap_or("Unknown".to_string()))
}

#[cfg(not(target_os = "macos"))]
fn get_computer_name() -> String {
    System::host_name().unwrap_or("Unknown".to_string())
}

#[tauri::command]
fn kill_pid(pid: u32, state: State<'_, AppState>) -> Result<(), String> {
    let mut sys = state.sys.lock().map_err(|e| e.to_string())?;

    let n_pid = sysinfo::Pid::from_u32(pid);
    sys.refresh_processes(sysinfo::ProcessesToUpdate::Some(&[n_pid]), true);

    if let Some(pr) = sys.process(n_pid) {
        if !pr.kill() {
            Err("Failed to send kill signal.".to_string())
        } else {
            Ok(())
        }
    } else {
        Err("Process not found".to_string())
    }
}

#[tauri::command]
fn init_config(state: State<'_, AppState>) -> Result<Config, String> {
    let mut path = PathBuf::from(state.app_dir.clone());
    path.push("config.json");
    println!("{:#?}", path);

    let mut map = if path.exists() {
        let file = File::open(&path).map_err(|e| e.to_string())?;
        let reader = BufReader::new(file);

        let delta: Value = serde_json::from_reader(reader).map_err(|e| e.to_string())?;
        delta.as_object().cloned().unwrap_or_default()
    } else {
        Map::new()
    };

    let graph_grad = map
        .entry("graph_grad".to_string())
        .or_insert(Value::Bool(true))
        .as_bool()
        .unwrap_or(true);
    let card_colour = map
        .entry("card_colour".to_string())
        .or_insert(Value::Bool(true))
        .as_bool()
        .unwrap_or(false);
    let brit = map
        .entry("brit".to_string())
        .or_insert(Value::Bool(true))
        .as_bool()
        .unwrap_or(true);
    let on_top = map
        .entry("on_top".to_string())
        .or_insert(Value::Bool(false))
        .as_bool()
        .unwrap_or(true);

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let pretty_json =
        serde_json::to_string_pretty(&Value::Object(map.clone())).map_err(|e| e.to_string())?;
    file.write_all(pretty_json.as_bytes())
        .map_err(|e| e.to_string())?;

    let config = Config {
        graph_grad,
        card_colour,
        brit,
        on_top,
    };

    let mut x = state.config.lock().map_err(|e| e.to_string())?;
    *x = Some(config.clone());

    Ok(config)
}

#[cfg(not(target_os = "macos"))]
fn update_gpu_info(state: &AppState) -> Result<GPUPayload, String> {
    let smi = &state.smi;
    let base = &state.base_gpu;

    let mut gpux = "".to_string();
    let mut coresx = 0;

    for g in smi.get_gpu_info() {
        let gcores = g.gpu_core_count.unwrap_or(0);
        if gcores > coresx {
            coresx = gcores;
            gpux = g.uuid.clone();
        }
    }
    if let Some(gpu) = smi.get_gpu_by_uuid(&gpux) {
        let util = gpu.utilization as f32;
        let vu = (gpu.used_memory as f64 * 0.000000001) as f32;
        let temp = gpu.temperature as f32;
        let freq = gpu.frequency as f32;
        let power = gpu.power_consumption as f32;

        Ok(GPUPayload {
            util,
            vu,
            vt: base.vt,
            temp,
            name: base.name.clone(),
            hname: base.hname.clone(),
            freq,
            power,
            cores: base.cores,
        })
    } else {
        Err("Cannot retrieve GPU info.".to_string())
    }
}

#[cfg(target_os = "macos")]
fn update_gpu_info(state: &AppState, sampler: &mut Sampler) -> Result<GPUPayload, String> {
    let base = &state.base_gpu;
    let metrics = sampler.get_metrics(2000).map_err(|e| e.to_string())?;

    let util = metrics.gpu_usage.1;
    let vu = (metrics.memory.ram_usage as f64 * 0.000000001) as f32;
    let vt = (metrics.memory.ram_total as f64 * 0.000000001) as f32;
    let temp = metrics.temp.gpu_temp_avg;
    let freq = (metrics.gpu_usage.0 as f64 / 1000.0) as f32; // (frequency, usage). freq is in mhz
    let power = metrics.gpu_power as f32;

    Ok(GPUPayload {
        util,
        vu,
        vt,
        temp,
        name: base.name.clone(),
        hname: base.hname.clone(),
        freq,
        power,
        cores: base.cores,
    })
}

#[tauri::command]
fn fetch_gpu_info(state: State<'_, AppState>) -> Result<GPUPayload, String> {
    let smi = &state.smi;
    let base = &state.base_gpu;
    if let Some(gpu) = smi.get_gpu_info().get(0) {
        let util = gpu.utilization as f32;
        let vu = (gpu.used_memory as f64 * 0.000000001) as f32;
        let temp = gpu.temperature as f32;
        let freq = gpu.frequency as f32;
        let power = gpu.power_consumption as f32;
        // instance and devuice type

        Ok(GPUPayload {
            util,
            vu,
            vt: base.vt,
            temp,
            name: base.name.clone(),
            hname: base.hname.clone(),
            freq,
            power,
            cores: base.cores,
        })
    } else {
        Err("Cannot retrieve GPU info.".to_string())
    }
}

#[tauri::command]
fn update_config(config: Config, state: State<'_, AppState>) -> Result<(), String> {
    let mut x = state.config.lock().map_err(|e| e.to_string())?;
    *x = Some(config.clone());

    let mut map = Map::new();
    map.insert("graph_grad".to_string(), Value::Bool(config.graph_grad));
    map.insert("card_colour".to_string(), Value::Bool(config.card_colour));
    map.insert("brit".to_string(), Value::Bool(config.brit));
    map.insert("on_top".to_string(), Value::Bool(config.on_top));

    let mut path = PathBuf::from(state.app_dir.clone());
    path.push("config.json");

    let mut file = File::create(path).map_err(|e| e.to_string())?;
    let pretty_json =
        serde_json::to_string_pretty(&Value::Object(map.clone())).map_err(|e| e.to_string())?;
    file.write_all(pretty_json.as_bytes())
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
fn switch_info(other: u32, state: State<'_, AppState>) -> Result<(), String> {
    let mut s = state.info_type.lock().map_err(|e| e.to_string())?;
    *s = other;
    Ok(())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let mut sys = System::new_all();
    sys.refresh_all();
    let comp = Components::new_with_refreshed_list();

    let system = SystemInfo {
        name: get_computer_name(),
        os: {
            let raw = System::name().unwrap_or("Unknown".to_string());
            if raw == "Darwin" {
                "macOS".to_string()
            } else {
                raw
            }
        },
        version: System::os_version().unwrap_or("Unknown".to_string()),
        uptime: format_time(System::uptime()),
        processes: sys.processes().len() as u32,
        load: System::load_average().one as f32,
        swap: (sys.used_swap() as f32) * 0.000000001,
        variance: 0.0,
    };
    let smi = AllSmi::new().unwrap_or(AllSmi::new().unwrap_or({
        std::thread::sleep(Duration::from_secs(1));
        AllSmi::new().unwrap()
    }));

    let gpu_info = smi.get_gpu_info();

    let cores = if let Some(gpu) = smi.get_gpu_info().get(0) {
        gpu.gpu_core_count.unwrap_or(0)
    } else {
        0
    };

    let base_gpu = GPUPayload {
        util: 0.0,
        vu: 0.0,
        vt: if let Some(g) = gpu_info.get(0) {
            (g.total_memory as f64 * 0.000000001) as f32
        } else {
            0.0
        },
        temp: 0.0,
        name: if let Some(g) = gpu_info.get(0) {
            g.name.clone()
        } else {
            "Unknown".to_string()
        },
        hname: if let Some(g) = gpu_info.get(0) {
            g.hostname.clone()
        } else {
            "Unknown".to_string()
        },
        freq: 0.0,
        power: 0.0,
        cores,
    };
    tauri::Builder::default()
        .setup(|app| {
            let app_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to find app data directory :(");
            fs::create_dir_all(&app_dir).expect("Failed to create app data directory :(");

            app.manage(AppState {
                sys: Mutex::new(sys),
                comp: Mutex::new(comp),
                base: Mutex::new(UpdatePayload {
                    cpu: CPUInfo {
                        name: "N/A".to_string(),
                        cores: 0,
                        threads: 0,
                        util: 0.0,
                        temp: 0.0,
                        freq: 0.0,
                    },
                    threads: Vec::new(),
                    system,
                    top: Vec::new(),
                }),
                config: Mutex::new(None),
                app_dir: app_dir.to_str().unwrap().to_string(),
                info_type: Mutex::new(0),
                smi,
                base_gpu,
            });

            #[cfg(target_os = "macos")]
            let t = 0;

            #[cfg(not(target_os = "macos"))]
            let t = 3;

            let h = app.handle().clone();
            std::thread::spawn(move || {
                #[cfg(target_os = "macos")]
                let mut sampler = Sampler::new().unwrap();

                loop {
                    let state = h.try_state::<AppState>().unwrap();

                    let inf = match state.info_type.lock() {
                        Ok(guard) => *guard,
                        Err(_) => {
                            std::thread::sleep(Duration::from_secs(2));
                            continue;
                        }
                    };

                    match inf.clone() {
                        0 => {
                            std::thread::sleep(Duration::from_secs(2));
                            if let Ok(info) = update_info(&state) {
                                h.emit("update_info", info).unwrap_or_else(|e| {
                                    eprintln!("emit error: {}", e);
                                });
                            }
                        }
                        1 => {
                            std::thread::sleep(Duration::from_secs(t));

                            #[cfg(target_os = "macos")]
                            let out = update_gpu_info(&state, &mut sampler);

                            #[cfg(not(target_os = "macos"))]
                            let out = update_gpu_info(&state);

                            if let Ok(info) = out {
                                h.emit("update_gpu_info", info).unwrap_or_else(|e| {
                                    eprintln!("emit error: {}", e);
                                });
                            }
                        }
                        _ => {}
                    }
                }
            });
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            fetch_info,
            kill_pid,
            update_config,
            init_config,
            switch_info,
            fetch_gpu_info
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
