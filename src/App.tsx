import React, { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from '@tauri-apps/api/window';
import { getVersion } from '@tauri-apps/api/app';
import { Toaster, toast } from "sonner";
import { motion, AnimatePresence } from "framer-motion";
import { Cpu, CodeXml, Pencil, Activity, Laptop, X as Cross, SquareCode, HardDrive, GitCompare, Gauge, Settings, Gpu } from 'lucide-react';
import "./App.css";
import { listen } from "@tauri-apps/api/event";
import { b } from "framer-motion/client";

function Laser({ v, e }: any) {
  return <div className={`${v ? "bg-linear-to-b h-full w-px mx-1" : "bg-linear-to-r h-px w-full my-2"} from-transparent from-2% via-pulse to-transparent to-98% transform-gpu select-none z-50 ${e ? e : "opacity-20"}`} />
}

function Graph({ data, w, h }: any) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !data?.length) return;

    const draw = () => {
      if (!data?.length) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const dpr = window.devicePixelRatio || 1;

      const displayW = canvas.clientWidth;
      const displayH = canvas.clientHeight;

      canvas.width = displayW * dpr;
      canvas.height = displayH * dpr;
      ctx.scale(dpr, dpr);

      ctx.clearRect(0, 0, displayW, displayH);

      const points = data.map((d: any, i: number) => ({
        x: (i / (data.length - 1)) * displayW,
        y: displayH - (d.y / 100) * displayH,
      }));

      const grad = ctx.createLinearGradient(0, 0, 0, displayH);
      grad.addColorStop(0, "rgba(57,255,106,0.4)");
      grad.addColorStop(1, "rgba(17,31,20,0.0)");

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((p: any) => ctx.lineTo(p.x, p.y));
      ctx.lineTo(displayW, displayH);
      ctx.lineTo(0, displayH);
      ctx.closePath();
      ctx.fillStyle = grad;
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      points.slice(1).forEach((p: any) => ctx.lineTo(p.x, p.y));
      ctx.strokeStyle = "#7DFFAA";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    };

    const re_obs = new ResizeObserver(() => {
      draw();
    });
    re_obs.observe(canvas);

    draw();
    return () => re_obs.disconnect();

  }, [data])
  return (
    <div className={`${w} ${h} pointer-events-none select-none flex flex-col justify-end`}>
      <canvas ref={canvasRef} className="w-full h-full" />
    </div>
  );
}

interface CPUInfo {
  name: string,
  cores: number,
  threads: number,
  util: number,
  temp: number,
  freq: number,
}

function OverView({ utilData, info, config }: any) {
  let temp = info ? (config.brit ? info?.temp : info?.temp * 1.8 + 32) : 0.0;
  return (<div className="flex flex-col items-center justify-center w-full transform-gpu">
    <div className="flex flex-row items-center justify-around px-6 w-full h-20 mb-2 transform-gpu">
      <div className="flex flex-row items-center justify-center">
        <Cpu size={60} strokeWidth={1.0} className="text-pulse drop-shadow-[0_0_6px_var(--color-pulse)]" />
        <div className="flex flex-col items-start justify-center m-6">
          <div className="text-terminal font-mono tracking-widest text-lg">{info ? info.name : "Fetching..."}</div>
          <div className="text-transparent bg-clip-text bg-linear-to-br from-terminal to-pulse font-mono tracking-widest text-xs">{info ? info.cores : "-"} cores | {info ? info.threads : "-"} threads</div>
        </div>
      </div>
      <Laser v={true} />

      <div className="flex flex-col items-start justify-center h-full">
        <div className="text-transparent bg-clip-text bg-linear-to-br from-terminal to-pulse font-mono tracking-widest text-xs m-2 shrink-0 uppercase select-none">CPU Utilization</div>
        <div className="flex flex-row items-center justify-center h-10 ml-2">
          <div className="text-pulse font-mono tracking-widest text-2xl">{info ? ((Math.round(info.util)) < 10 ? "0" : "") : ""}{info ? (Math.round(info.util)) : "--"}%</div>
          {config.graph_grad && (<Graph data={[...utilData.current]} h="h-10" w="p-2 w-30" />)}
        </div>
      </div>
      <Laser v={true} />

      <div className="flex flex-col items-start justify-around h-full">
        <div className="text-transparent bg-clip-text bg-linear-to-br from-terminal to-pulse font-mono tracking-widest text-xs m-2 shrink-0 select-none">TEMP</div>
        <div className="text-pulse font-mono tracking-widest text-2xl ml-2">{info ? (info.temp > -10 ? `${temp.toFixed(1)}°` : "--.-°") : "--.-°"}{config.brit ? "C" : "F"}</div>
      </div>

      <Laser v={true} />
      <div className="flex flex-col items-start justify-around h-full">
        <div className="text-transparent bg-clip-text bg-linear-to-br from-terminal to-pulse font-mono tracking-widest text-xs m-2 shrink-0 uppercase select-none">Frequency</div>
        <div className="text-pulse font-mono tracking-widest text-2xl ml-2">{info ? info.freq.toFixed(2) : "-.--"} GHz</div>
      </div>

    </div>
    <Laser v={false} />
  </div>)
}

function ThreadCard({ x, data, config }: any) {
  let util = config.card_colour ? x.util : 50;
  return <div className={`bg-liquid border border-glass-border rounded-xl w-67 h-80 mb-6
  ${util <= 15 ? "saturate-0 scale-90" : ""} ${util >= 80 ? (util >= 90 ? "-hue-rotate-120 scale-106" : "-hue-rotate-90") : ""}
  transition-all duration-1000 transform-gpu hover:scale-106 hover:duration-250`}>
    <div className="flex flex-col items-center justify-around h-full pb-2">
      <div className="flex flex-row items-center justify-between w-full p-2">
        <div className="flex flex-col items-start justify-center">
          <div className="text-transparent bg-clip-text bg-linear-to-br from-terminal to-pulse font-mono tracking-widest m-2 shrink-0 text-xs select-none uppercase">{x.name.length <= 2 ? "Thread " : ""}{x.name}</div>
          <div className="text-phosphor/50 font-mono tracking-widest text-[0.6rem] ml-2 uppercase select-none">{x.perf ? "Performance" : "Efficiency"}</div>
        </div>
        <div className="text-pulse font-mono tracking-widest mr-2">{(Math.round(x.util)) < 10 ? "0" : ""}{(Math.round(x.util))}%</div>
      </div>
      {config.graph_grad && <Graph data={[...data]} h="h-1/2" w="w-full" />}
      <Laser v={false} />
      <div className="flex flex-row items-center justify-between w-full px-4 py-2">
        <div className="text-circuit font-mono tracking-widest text-xs">L1D: {x.l1} KB</div>
        <div className="text-circuit font-mono tracking-widest text-xs">L2: {x.l2} KB</div>
      </div>
      <div className="flex flex-row items-center justify-between w-full px-4 py-2">
        <div className="text-circuit font-mono tracking-widest text-xs select-none">Base: {x.freq.toFixed(2)} GHz</div>
        <div className="text-circuit font-mono tracking-widest text-xs select-none">OS_{x.os}</div>
      </div>
    </div>
  </div>
}

function MainScreen({ config }: any) {
  const [info, setInfo] = useState<UpdatePayload>();
  const utilData = useRef<{ y: number }[]>([{ y: 0 }]);
  const coreUtils = useRef<{ y: number }[][]>([]);

  useEffect(() => {
    const init = async () => {
      invoke<UpdatePayload>("fetch_info")
        .then((s) => {
          setInfo(s);
          utilData.current = [{ y: s.cpu.util }];
          if (s.threads && s.threads.length > 0) {
            coreUtils.current = s.threads.map(c => [{ y: c.util }]);
          }
        })
        .catch((err) => toast.error("Failed to fetch CPU info", { description: `${err}` }));
    }
    init();

    const unlisten = listen<UpdatePayload>("update_info", (e) => {
      utilData.current.push({ y: e.payload.cpu.util });
      if (utilData.current.length > 60) utilData.current.shift();

      coreUtils.current.forEach((hist, idx) => {
        hist.push({ y: e.payload.threads[idx].util });
        if (hist.length > 60) hist.shift();
      });

      setInfo(e.payload);
    });

    return () => { unlisten.then((f) => f()); };
  }, [])
  return (<div className="flex flex-col items-start justify-start h-full w-full transform-gpu">
    <OverView utilData={utilData} info={info?.cpu} config={config} />
    <div className="w-full overflow-y-auto overflow-x-hidden px-8 pt-4 scrollbar-none flex-1">
      <div className="grid grid-cols-[repeat(auto-fit,minmax(268px,1fr))] gap-4 w-full pb-2">
        {info?.threads?.map((thread, idx) => (
          <ThreadCard key={idx} x={thread} data={coreUtils.current[idx]} config={config} />
        ))}
      </div>
    </div>
    <InfoTray info={info} />
  </div>)
}

function InfoSlot({ Icon, name, data, title }: any) {
  return <div title={title} className="flex flex-row items-center justify-between w-full py-2 overflow-hidden">
    <Icon size={20} className="text-pulse shrink-0" />
    <div className="text-transparent bg-linear-to-br from-terminal to-pulse bg-clip-text font-mono text-center ml-4 select-none">{name}</div>
    <div className="flex-1 min-w-4 shrink-0" />
    <div className="text-pulse font-mono text-center shrink-0">{data}</div>
  </div>
}

function ProcessCard({ pr }: { pr: ProcessInfo }) {
  const [killed, setKilled] = useState(false);
  useEffect(() => {
    setKilled(false);
  }, [pr])

  async function killPID(e: React.MouseEvent) {
    e.stopPropagation()
    try {
      await invoke("kill_pid", { pid: pr.pid });
      setKilled(true);
    } catch (err) {
      toast.error(`Failed to kill process ${pr.pid}`, { description: `${err}` });
    }
  }
  const hueRot = Math.min(Math.sqrt(pr.util / 100) * 120, 120);
  return <div title={`PID: ${pr.pid}`} className={`flex flex-row items-center justify-between w-full py-2 overflow-hidden group ${killed ? "scale-0 opacity-0 pointer-events-none cursor-default" : ""}`}>
    <div className="relative h-5 w-5 shrink-0 cursor-pointer"
      onClick={killPID}>
      <CodeXml style={{ filter: `hue-rotate(-${hueRot}deg)` }} size={20} className="absolute text-pulse opacity-100 scale-100 group-hover:opacity-0 group-hover:scale-50 transition-all duration-250" />
      <Cross size={20} className="absolute text-red-700 opacity-0 scale-50 group-hover:opacity-100 group-hover:scale-100 transition-all duration-250 transform-gpu" />
    </div>

    <div className="text-transparent bg-linear-to-br from-terminal to-pulse bg-clip-text font-mono text-center ml-4 select-none truncate">{pr.name}</div>
    <div className="flex-1 min-w-4 shrink-0" />
    <div className="text-pulse font-mono text-center shrink-0">{pr.util.toFixed(1)}%</div>
  </div>
}

function InfoTray({ info }: { info: UpdatePayload | undefined }) {
  return <div className="flex w-full h-65">
    <div className="flex-1 border border-pulse shadow-[inset_0_0_16px_#7DFFAA80] rounded-2xl mx-6 my-2">
      <div className="flex flex-row items-center justify-between h-full w-full py-4 px-6">

        <div className="flex flex-col items-center justify-end w-8/27">
          <div className="text-transparent bg-linear-to-br from-terminal to-pulse bg-clip-text font-mono tracking-widest text-lg text-center mb-2 select-none">System Summary</div>
          <InfoSlot Icon={Pencil} name="Name" data={info?.system.name ?? "..."} />
          <InfoSlot Icon={Laptop} name="OS Type" data={info?.system.os ?? "..."} />
          <InfoSlot Icon={CodeXml} name="Version" data={info?.system.version ?? "..."} />
          <InfoSlot Icon={Activity} name="Uptime" data={info?.system.uptime ?? "..."} />
        </div>

        <Laser v={true} />

        <div className="flex flex-col items-center justify-start w-8/27 overflow-hidden">
          <div className="text-transparent bg-linear-to-br from-terminal to-pulse bg-clip-text font-mono tracking-widest text-lg text-center mb-2 select-none">Top Processes</div>
          {info?.top.map((pr) => {
            return <ProcessCard key={pr.pid} pr={pr} />
          })}
          <div className="h-full w-full shrink-0" />
        </div>

        <Laser v={true} />

        <div className="flex flex-col items-center justify-end w-8/27 overflow-hidden mr-2">
          <div className="text-transparent bg-linear-to-br from-terminal to-pulse bg-clip-text font-mono tracking-widest text-lg text-center mb-2 select-none">Statistics</div>
          <InfoSlot Icon={SquareCode} name="Processes" data={info?.system.processes} title="Total number of active and background processes currently handled by the OS." />
          <InfoSlot Icon={HardDrive} name="Swap" data={`${info?.system.swap.toFixed(2)} GB`} title="Amount of storage space currently being used as virtual memory." />
          <InfoSlot Icon={GitCompare} name="Thread Variance" data={`${info?.system.variance.toFixed(1)}%`} title="The utilization gap between the most and least active threads. Lower variance means better multi-core workload distribution." />
          <InfoSlot Icon={Gauge} name="Load Average" data={info?.system.load.toFixed(2)} title="The average number of tasks using or waiting for CPU time over the last minute. May not work on Windows." />
        </div>

      </div>
    </div>
  </div>
}

interface Thread {
  name: string,
  util: number,
  freq: number,
  l1: number,
  l2: number,
  perf: boolean,
  os: number
}

interface ProcessInfo {
  name: string,
  util: number,
  pid: number,
}

interface SystemInfo {
  name: string,
  os: string,
  version: string,
  uptime: string,
  processes: number,
  swap: number,
  variance: number,
  load: number
}

interface UpdatePayload {
  cpu: CPUInfo,
  threads: Array<Thread>,
  system: SystemInfo,
  top: Array<ProcessInfo>,
}

function ScreenButton({ Icon, name, screen, setScreen, idx }: any) {
  async function onClick(e: React.MouseEvent) {
    e.stopPropagation();
    try {
      invoke("switch_info", { other: idx });
      setScreen(idx)
    } catch (err) {
      toast.error("Failed to switch info", { description: `${err}` });
    }
  }
  return <motion.div layout onClick={onClick} className="flex flex-row items-center justify-center w-full transform-gpu cursor-pointer">

    <motion.div layout>
      <Icon size={40} strokeWidth={1.0} className={`transition-all duration-300 ${screen === idx ? "scale-100 saturate-100 text-pulse" : "scale-80 hover:scale-100 text-muted"}`} />
    </motion.div>

    <AnimatePresence>
      {screen === idx && (<motion.div
        initial={{ opacity: 0, width: 0, marginLeft: 0 }}
        animate={{ opacity: 1, width: "auto", marginLeft: 16 }}
        transition={{ duration: 0.5 }}
        exit={{ opacity: 0, width: 0, marginLeft: 0 }}
        className="font-mono tracking-widest text-transparent bg-linear-to-br from-terminal to-pulse bg-clip-text overflow-hidden whitespace-nowrap">{name}</motion.div>)}
    </AnimatePresence>

  </motion.div>
}

function SideBar({ screen, setScreen }: any) {
  return <div className="absolute top-0 flex flex-col items-center justify-center h-screen left-5">
    <div className="h-full my-8 w-45 bg-liquid border-2 border-aurora rounded-4xl transform-gpu shadow-[inset_0_0_35px_#39FF6AA0]">
      <div className="flex flex-col items-center justify-center h-full select-none">

        <div className="absolute top-10 my-8 flex flex-col items-center justify-center saturate-110">
          <div className="font-mono text-phosphor tracking-[0.6em] ml-[0.6em] text-xl uppercase font-semibold transform-gpu drop-shadow-[0_0_14px_var(--color-aurora)]">Silicon</div>
          <Laser v={false} />
          <div className="font-mono text-muted tracking-[0.3em] ml-[0.3em] font-extrabold text-xs uppercase mt-1">Runner</div>
        </div>

        <div className="flex flex-col items-center justify-evenly gap-8 h-1/8">
          <ScreenButton Icon={Cpu} name="CPU" screen={screen} setScreen={setScreen} idx={0} />
          <ScreenButton Icon={Gpu} name="GPU" screen={screen} setScreen={setScreen} idx={1} />
          <ScreenButton Icon={Settings} name="Settings" screen={screen} setScreen={setScreen} idx={2} />
        </div>

      </div>
    </div>
  </div>
}

interface GPUPayload {
  util: number,
  vu: number,
  vt: number,
  temp: number,
  name: string,
  hname: string,
  freq: number,
  power: number,
  cores: number,
}

function GPUOverView({ info, config }: any) {
  let hueRot = config.card_colour ? (Math.min(info.util * 120, 120)) : 0;
  return (<div style={{ filter: `hue-rotate(-${hueRot}deg)` }} className="flex flex-col items-around justify-center w-full transition-all duration-1000">
    <div className="flex flex-row items-center justify-around px-6 my-6 w-full h-20">
      <div className="flex flex-row items-center justify-center">
        <Gpu size={80} strokeWidth={1.0} className="text-pulse drop-shadow-[0_0_8px_var(--color-pulse)] transform-gpu" />
        <div className="flex flex-col items-start justify-center m-6">
          <div className="text-terminal font-mono tracking-widest text-lg">{info ? info.name : "Fetching..."}</div>
          <div className="text-transparent bg-clip-text bg-linear-to-br from-terminal to-pulse font-mono tracking-widest">{info ? info.cores : "-"} cores</div>
        </div>
      </div>

      <div className="h-6 w-6 rounded-full transform-gpu border-2 border-aurora bg-pulse shadow-[0_0_10px_var(--color-pulse),0_0_24px_var(--color-pulse),0_0_32px_var(--color-pulse),0_0_48px_var(--color-pulse)]" />

    </div>
    <Laser v={false} e="opacity-100" />
  </div>)
}

function GPUCard({ config, current, past, max, name, displayFN, h, w, fn, nSize, dSize, title }: any) {
  let hueRot = config.card_colour ? (Math.min(fn(current) / max * 120, 120)) : 0;
  return (<div title={title} style={{ filter: `hue-rotate(-${hueRot}deg)` }} className={`transform-gpu ${h} ${w} rounded-2xl border-2 border-glass-border bg-liquid shadow-[inset_0_0_24px_var(--color-aurora)]
  transition-all hover:scale-103 duration-300`}>
    <div className="flex flex-col items-center justify-between py-4 h-full w-full overflow-hidden gap-4 transform-gpu">

      <div className="flex flex-col gap-4 items-center justify-center shrink-0 w-full pt-2">
        <div className={`text-transparent bg-clip-text bg-linear-to-br from-terminal to-pulse font-mono tracking-[0.3em] ml-[0.3em] m-2 shrink-0 select-none uppercase ${nSize}`}>{name}</div>
        <div className={`text-pulse font-mono tracking-widest mr-2 ${dSize}`}>{displayFN(current)}</div>
      </div>
      <Graph data={[...past.current]} w="w-full" h="flex-1 min-h-0" />
      <div className="w-15/16 h-3 bg-glass-border/30 border border-muted/20 rounded-2xl overflow-hidden mb-2 shrink-0">
        <div
          className="bg-linear-to-r from-terminal to-pulse h-full transition-all duration-300 ease-out"
          style={{ width: `${(fn(current) / max) * 100}%` }} />
      </div>
    </div>
  </div>)
}

function GPUSmallCard({ current, name, displayFN, h, w, hueRot, peak, setPeak }: any) {
  useEffect(() => {
    if (current > peak) {
      setPeak(current);
    }
  }, [current])
  return (<div style={{ filter: `hue-rotate(-${hueRot}deg)` }} className={`transform-gpu ${h} ${w} rounded-2xl border-2 border-glass-border bg-liquid shadow-[inset_0_0_24px_var(--color-aurora)]
  transition-all hover:scale-103 duration-300`}>
    <div className="flex flex-col items-center justify-evenly py-4 h-full w-full overflow-hidden transform-gpu">
      <div className={`text-transparent bg-clip-text bg-linear-to-br from-terminal to-pulse font-mono m-2 shrink-0 select-none uppercase text-2xl tracking-[0.3em] ml-[0.3em] transform-gpu`}>{name}</div>
      <div className="text-muted/50 font-mono text-xs select-none">PEAK: {displayFN(peak)}</div>
      <div className={`text-pulse font-mono tracking-widest text-4xl`}>{displayFN(current)}</div>
    </div>
  </div>)
}

function GPUScreen({ config }: any) {
  const [info, setInfo] = useState<GPUPayload>({
    util: 0,
    vu: 0,
    vt: 0,
    temp: 0,
    name: "Unkown",
    hname: "Unknown",
    freq: 0,
    power: 0,
    cores: 0,
  });
  const utilData = useRef<{ y: number }[]>([{ y: 0 }]);
  const tempData = useRef<{ y: number }[]>([{ y: 0 }]);
  const vramData = useRef<{ y: number }[]>([{ y: 0 }]);

  const [powerPeak, setPowerPeak] = useState(0);
  const [freqPeak, setFreqPeak] = useState(0);

  useEffect(() => {
    const init = async () => {
      invoke<GPUPayload>("fetch_gpu_info")
        .then((s) => {
          setInfo(s);
          utilData.current = [{ y: s.util }];
          tempData.current = [{ y: s.temp }];
          vramData.current = [{ y: s.vu }];
        })
        .catch((err) => toast.error("Failed to fetch GPU info", { description: `${err}` }));
    }
    init();

    const unlisten = listen<GPUPayload>("update_gpu_info", (e) => {
      utilData.current.push({ y: e.payload.util * 100 });
      if (utilData.current.length > 60) utilData.current.shift();

      tempData.current.push({ y: (Math.min(e.payload.temp, 110) / 110) * 100 });
      if (tempData.current.length > 60) tempData.current.shift();

      vramData.current.push({ y: (Math.min(e.payload.vu, e.payload.vt) / e.payload.vt) * 100 });
      if (vramData.current.length > 60) vramData.current.shift();

      setInfo(e.payload);
    });

    return () => { unlisten.then((f) => f()); };
  }, [])
  console.log(utilData);
  return (<div className="flex flex-col items-start justify-start h-full w-full transform-gpu">
    <GPUOverView info={info} config={config} />
    <div className="py-4 px-8 flex-1 min-h-0 w-full">
      <div className="flex flex-row w-full h-full">
        <GPUCard
          config={config}
          current={info.util}
          past={utilData}
          max={100} name="Usage"
          displayFN={(x: number) => { return `${(x * 100).toFixed(1)}%` }}
          h="h-full"
          w="w-1/2"
          fn={(x: number) => { return x * 100.0 }}
          nSize="text-3xl"
          dSize="text-4xl"
        />
        <div className="flex flex-col w-1/2 h-full mx-8">
          <GPUCard
            config={config}
            current={info.temp}
            past={tempData}
            max={110} name="Temperature"
            displayFN={(x: number) => { return `${(config.brit ? Math.min(x, 110) : Math.min(x, 110) * 9 / 5 + 32).toFixed(1)}°${config.brit ? "C" : "F"}` }}
            h="h-1/2"
            w="w-full"
            fn={(x: number) => { return Math.min(x, 110) }}
            nSize="text-2xl"
            dSize="text-3xl"
          />
          <div className="flex flex-row w-full h-1/2 pt-8">
            <div className="flex flex-col h-full w-1/2 pr-8 gap-8 transform-gpu">
              <GPUSmallCard
                current={info.power}
                name="Power"
                displayFN={(x: number) => { return `${x.toFixed(2)} W` }}
                h="h-1/2"
                w="w-full"
                hueRot={config.card_colour ? (Math.min(info.util * 120, 120)) : 0}
                peak={powerPeak}
                setPeak={setPowerPeak}
              />
              <GPUSmallCard
                current={info.freq}
                name="Frequency"
                displayFN={(x: number) => { return `${x.toFixed(2)} GHz` }}
                h="h-1/2"
                w="w-full"
                hueRot={config.card_colour ? (Math.min(info.util * 120, 120)) : 0}
                peak={freqPeak}
                setPeak={setFreqPeak}
              />
            </div>
            <GPUCard
              config={config}
              current={[info.vu, info.vt]}
              past={vramData}
              max={info.vt} name="VRAM"
              displayFN={(x: any) => { return `${x[0].toFixed(2)} / ${x[1].toFixed(2)} GB` }}
              h="h-full"
              w="w-1/2"
              fn={(x: any) => { return x[0] as number }}
              nSize="text-2xl"
              dSize="text-2xl"
              title="VRAM metrics may be inaccurate on macOS due to forced swap memory usage"
            />
          </div>
        </div>
      </div>
    </div>
  </div>)
}

function Switch({ cardKey, config, setConfig, customFN }: any) {
  async function toggle() {
    let current = config[cardKey];
    let orig = config;

    const newConfig = {
      ...config,
      [cardKey]: !current
    };
    await setConfig(newConfig);
    try {
      await invoke("update_config", { config: newConfig });
    } catch (err) {
      setConfig(orig);
      toast.error("Failed to update settings", { description: `${err}` });
    }
    if (customFN) {
      await customFN(!current);
    }
  }
  return (
    <div className="flex flex-row items-center justify-center w-full select-none">
      <Laser v={false} />
      <div
        onClick={toggle}
        className={`h-10 w-25 mr-50 ml-2 shrink-0 ${config[cardKey] ? "bg-pulse/40" : "bg-black"} rounded-full border border-glass-border transition-all duration-200 cursor-pointer`}>
        <div className="flex flex-col h-full w-full justify-center">
          <div
            className={`${(config[cardKey])
              ? "translate-x-10.5 bg-aurora shadow-[0_0_48px_var(--color-phosphor)] border border-terminal"
              : "bg-circuit/40 shadow-none border-circuit border"}
            ml-1 h-8 w-12 rounded-full transition-all duration-200 transform-gpu`} />
        </div>
      </div>
    </div>
  )
}

interface Config {
  graph_grad: boolean,
  card_colour: boolean,
  brit: boolean,
  on_top: boolean,
}

function SettingsCard({ name, description, cardKey, config, setConfig, customFN }: any) {
  return (
    <div className="flex flex-row w-full items-center justify-between mb-5 transform-gpu">
      <div className="flex flex-col shrink-0">
        <div className="font-mono tracking-widest text-transparent bg-linear-to-tr from-terminal to-pulse bg-clip-text text-2xl select-none drop-shadow-[0_0_8px_rgba(170,255,170)] transform-gpu">{name}</div>
        <div className="font-mono text-transparent bg-linear-to-tr from-phosphor/70 to-pulse/70 bg-clip-text text-lg select-none">{description}</div>
      </div>
      <Switch cardKey={cardKey} config={config} setConfig={setConfig} customFN={customFN} />
    </div>
  )
}

function SettingsScreen({ config, setConfig }: any) {
  const [appVersion, setAppVersion] = useState("v0.0.0");

  useEffect(() => {
    getVersion().then((version) => {
      setAppVersion(`v${version}`);
    });
  }, []);

  return (<div className="flex flex-col items-start justify-start h-full w-full">
    <div className="flex flex-col items-center justify-center w-full pt-8 pb-16">
      <div className="text-transparent bg-linear-to-br from-terminal to-pulse bg-clip-text text-5xl font-mono tracking-widest pb-3">Settings</div>
      <Laser v={false} e="opacity-100" />
    </div>

    <div className="w-full pl-15 transform-gpu">
      <SettingsCard name="Render Graphs" description="Display real-time graphs" cardKey="graph_grad" config={config} setConfig={setConfig} />
      <SettingsCard name="Reactive Colours" description="Allow colours to shift based on utilisation" cardKey="card_colour" config={config} setConfig={setConfig} />
      <div title="Tea & Rain units vs. Freedom & Eagles units" className="w-full"><SettingsCard name="Metric Units" description="Display temperatures in Celsius" cardKey="brit" config={config} setConfig={setConfig} /></div>
      <SettingsCard name="Floating Window" description="Keeps this window above all others" cardKey="on_top" config={config} setConfig={setConfig}
        customFN={
          async (other: boolean) => { await getCurrentWindow().setAlwaysOnTop(other) }
        } />
    </div>

    <div className="absolute bottom-5 left-10 font-mono text-transparent bg-linear-to-tr from-terminal to-pulse opacity-50 bg-clip-text text-xs select-none">
      silicon::architect [Lupascu]
    </div>

    <div className="absolute bottom-5 right-10 font-mono text-transparent bg-linear-to-tr from-terminal to-pulse opacity-50 bg-clip-text text-xs select-none">{appVersion}</div>
  </div>)
}

function App() {
  const [screen, setScreen] = useState(0);
  const [config, setConfig] = useState<Config>({ graph_grad: true, card_colour: true, brit: true, on_top: false });

  useEffect(() => {
    const getConfig = async () => {
      try {
        const c = await invoke("init_config");
        setConfig(c as Config);

        await getCurrentWindow().setAlwaysOnTop((c as Config)["on_top"])
      } catch (err) {
        toast.error("Failed to fetch settings", { description: `${err}` });
      }
    };
    getConfig();
  }, []);

  return (
    <>
      <div
        data-tauri-drag-region
        className="fixed top-0 left-0 right-0 h-8 z-9999 bg-transparent select-none"
        onMouseDown={(event) => {
          if (event.button === 0) {
            void getCurrentWindow().startDragging();
          }
        }}
      />
      <main className="relative h-screen w-screen bg-[#050a06] p-8 selection:bg-terminal/50 select-text overflow-hidden">
        <Toaster
          position="bottom-right"
          theme="dark"
          closeButton
          duration={Infinity}
          richColors />
        <SideBar screen={screen} setScreen={setScreen} />

        <div className="ml-50 py-3 border border-pulse shadow-[0_0_40px_#7DFFAA80] h-full rounded-4xl transform-gpu overflow-hidden">
          <AnimatePresence mode="wait">
            {(screen === 0)
              ? <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3 }}
                exit={{ opacity: 0 }}
                key={"main"}
                className="w-full h-full">
                <MainScreen config={config} /></motion.div>
              : (screen === 1)
                ? <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  exit={{ opacity: 0 }}
                  key={"gpu"}
                  className="w-full h-full">
                  <GPUScreen config={config} /></motion.div>
                : <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3 }}
                  exit={{ opacity: 0 }}
                  key={"settings"}
                  className="w-full h-full">
                  <SettingsScreen config={config} setConfig={setConfig} /></motion.div>
            }
          </AnimatePresence>
        </div>
      </main></>
  );
}

function Logo() {
  return (
    <>
      <div
        data-tauri-drag-region
        className="fixed top-0 left-0 right-0 h-8 z-9999 bg-transparent select-none"
        onMouseDown={(event) => {
          if (event.button === 0) {
            void getCurrentWindow().startDragging();
          }
        }}
      />
      <main className="relative h-screen w-screen bg-[#050a06] p-8 selection:bg-terminal/50 select-text overflow-hidden">
        <div className="flex flex-col items-center justify-center h-full w-full saturate-120">
          <div className="font-mono text-phosphor tracking-[0.6em] ml-[0.6em] text-6xl uppercase font-semibold transform-gpu drop-shadow-[0_0_24px_var(--color-aurora)]">Silicon</div>
          <div className="w-36 pt-3 pb-1 scale-200"><Laser v={false} e="opacity-40 drop-shadow-[0_0_2px_var(--color-aurora)]"/></div>
          <div className="font-mono text-muted tracking-[0.3em] ml-[0.3em] font-extrabold text-2xl uppercase mt-1">Runner</div>
        </div>
      </main></>
  );
}


export default App;