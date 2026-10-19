"use client";

import { Canvas, useFrame, useThree } from "@react-three/fiber";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { coinGeometries, makeClayMaterial, shadowTexture, walletGeometries } from "./clay";

gsap.registerPlugin(ScrollTrigger);

// Positions from the 3D stage in forepay.pen, in units of 100 design pixels from the stage centre.
// The first coin is the hero coin, the one that drops into the slot.
const COINS = [
  { x: -0.02, y: 1.72, z: 0.3, r: 0.78, amp: 0.1, period: 3.6, phase: 0, parallax: 1, shadowY: 0.98, shadow: [1.9, 0.42] },
  { x: -2.08, y: 0.92, z: 0.1, r: 0.38, amp: 0.06, period: 3.2, phase: 1.7, parallax: 0.7, shadowY: 0.55, shadow: [0.95, 0.22] },
  { x: 2.08, y: 1.54, z: -0.3, r: 0.46, amp: 0.08, period: 4.4, phase: 3.1, parallax: 0.4, shadowY: 1.1, shadow: [1.15, 0.26] },
] as const;

const MAX_TILT = (6 * Math.PI) / 180;

type Input = { drop: number; px: number; py: number; tilt: boolean };

// One unit is 100 design pixels at the design's 616 px stage width, at any canvas size.
function FitCamera() {
  const get = useThree((s) => s.get);
  const width = useThree((s) => s.size.width);
  useEffect(() => {
    const { camera } = get();
    camera.zoom = width / 6.16;
    camera.updateProjectionMatrix();
  }, [get, width]);
  return null;
}

function Scene({ input, detail }: { input: React.RefObject<Input>; detail: number }) {
  const root = useRef<THREE.Group>(null);
  const wallet = useRef<THREE.Group>(null);
  const coins = useRef<(THREE.Group | null)[]>([]);
  const coinShadows = useRef<(THREE.Mesh | null)[]>([]);
  const arrive = useRef({ wallet: 0, coins: [0, 0, 0] });

  const clay = useMemo(() => makeClayMaterial(), []);
  const w = useMemo(() => walletGeometries(detail), [detail]);
  const c = useMemo(() => coinGeometries(detail), [detail]);
  const shadows = useMemo(() => {
    const map = shadowTexture();
    const make = (opacity: number) =>
      new THREE.MeshBasicMaterial({ map, transparent: true, opacity, depthWrite: false });
    return { floor: make(0.2), coins: COINS.map(() => make(0.22)) };
  }, []);

  // Arrive: the wallet rises 24 px and grows from 0.92 on a spring, the coins pop in 90 ms apart.
  useEffect(() => {
    const a = arrive.current;
    const tl = gsap.timeline();
    tl.to(a, { wallet: 1, duration: 0.7, ease: "back.out(1.4)" }, 0);
    a.coins.forEach((_, i) => tl.to(a.coins, { [i]: 1, duration: 0.5, ease: "back.out(2.2)" }, 0.25 + i * 0.09));
    return () => {
      tl.kill();
    };
  }, []);

  useFrame(({ clock }) => {
    const t = clock.getElapsedTime();
    const { drop, px, py, tilt } = input.current;
    const a = arrive.current;

    // Follow the cursor, at most 6 degrees, eased 0.08 per frame, back to rest when it leaves.
    if (root.current) {
      const ry = tilt ? px * MAX_TILT : 0;
      const rx = tilt ? py * MAX_TILT : 0;
      root.current.rotation.y += (ry - root.current.rotation.y) * 0.08;
      root.current.rotation.x += (rx - root.current.rotation.x) * 0.08;
    }

    // The coin lands in the last quarter of the scrub; the wallet dips 6 px and settles.
    const land = Math.min(1, Math.max(0, (drop - 0.72) / 0.28));
    const dip = -0.06 * Math.sin(land * Math.PI) * (1 - land * 0.4);
    if (wallet.current) {
      wallet.current.scale.setScalar(0.92 + 0.08 * a.wallet);
      wallet.current.position.y = -0.98 - 0.24 * (1 - a.wallet) + dip;
    }

    COINS.forEach((coin, i) => {
      const g = coins.current[i];
      const sh = coinShadows.current[i];
      if (!g) return;
      const wave = Math.sin((t / coin.period) * Math.PI * 2 + coin.phase);
      const bob = wave * coin.amp;
      const par = tilt ? coin.parallax : 0;
      const ox = px * 0.12 * par;
      let y = coin.y + bob - py * 0.08 * par;
      let scale = coin.r * a.coins[i];
      if (i === 0) {
        // Falls past the slot and out of sight behind the front of the wallet.
        y = coin.y + bob * (1 - drop) - drop * 2.6;
      } else {
        y += drop * 0.5;
        scale *= 1 - drop;
      }
      // While dropping, the hero coin stands upright and moves into the middle of the wallet's
      // depth, so the front of the wallet hides it completely once it passes the slot.
      const enter = i === 0 ? Math.min(1, drop * 1.6) : 0;
      g.position.set(coin.x + ox, y, coin.z * (1 - enter));
      g.scale.setScalar(Math.max(0.0001, scale));
      g.rotation.x = 0.45 * enter;
      g.rotation.y = Math.sin(t * 0.5 + coin.phase) * 0.22 * (1 - enter);
      if (sh) {
        // The shadow breathes with the coin: smaller and fainter as it rises.
        const breathe = 1 - wave * 0.12;
        sh.scale.set(coin.shadow[0] * breathe * a.coins[i], coin.shadow[1] * breathe * a.coins[i], 1);
        sh.position.x = coin.x + ox;
        shadows.coins[i].opacity = 0.22 * breathe * (1 - drop);
      }
    });
  });

  return (
    <group ref={root}>
      <mesh geometry={w.flap} material={clay} position={[-0.08, 0.06, -0.45]} rotation={[0, 0, -0.122]} />
      <group ref={wallet} position={[0.02, -0.98, 0]}>
        <mesh geometry={w.body} material={clay} />
        <mesh geometry={w.slot} material={clay} position={[-0.1, 1.08, 0.58]} />
        <mesh geometry={w.clasp} material={clay} position={[1.78, 0, 0.5]} />
        <mesh geometry={w.button} material={clay} position={[1.79, 0.03, 0.74]} scale={[1, 1, 0.55]} />
      </group>
      <mesh material={shadows.floor} position={[0.04, -2.56, -0.6]} scale={[4.2, 0.8, 1]}>
        <planeGeometry />
      </mesh>
      {COINS.map((coin, i) => (
        <group key={i}>
          <mesh
            ref={(el) => {
              coinShadows.current[i] = el;
            }}
            material={shadows.coins[i]}
            position={[coin.x, coin.shadowY, coin.z - 0.4]}
          >
            <planeGeometry />
          </mesh>
          <group
            ref={(el) => {
              coins.current[i] = el;
            }}
            position={[coin.x, coin.y, coin.z]}
            scale={0.0001}
          >
            {/* Tipped back so the darker rim shows underneath, as drawn */}
            <group rotation={[-0.45, 0, 0]}>
              <mesh geometry={c.body} material={clay} />
              <mesh geometry={c.face} material={clay} position={[0, 0, 0.17]} />
              <mesh geometry={c.waveTop} material={clay} position={[0, 0, 0.23]} />
              <mesh geometry={c.waveBottom} material={clay} position={[0, 0, 0.23]} />
            </group>
          </group>
        </group>
      ))}
    </group>
  );
}

export function Canvas3D() {
  const host = useRef<HTMLDivElement>(null);
  const input = useRef<Input>({ drop: 0, px: 0, py: 0, tilt: false });
  const [visible, setVisible] = useState(true);
  // Phones get a lower pixel ratio.
  const [phone] = useState(() => window.innerWidth < 768);
  // Below 2 segments the bevels look cut, not clay; above it the geometry costs more than it shows.
  const detail = 2;

  useEffect(() => {
    const stage = host.current?.closest<HTMLElement>("[data-hero-stage]");
    const section = stage?.closest("section");
    if (!stage || !section) return;

    // Drop on scroll: the first 35% of the hero's scroll, scrubbed to the scrollbar.
    const trigger = ScrollTrigger.create({
      trigger: section,
      // Absolute scroll positions: the hero sits under the nav, so "top top" would start late.
      start: 0,
      end: () => section.offsetHeight * 0.35,
      scrub: true,
      onUpdate: (self) => {
        input.current.drop = self.progress;
      },
    });

    // Render only while the hero is on screen.
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting));
    io.observe(stage);

    // Follow the cursor over the hero, only with a fine pointer (desktop).
    const fine = window.matchMedia("(pointer: fine)").matches;
    const onMove = (e: PointerEvent) => {
      const r = section.getBoundingClientRect();
      input.current.px = ((e.clientX - r.left) / r.width) * 2 - 1;
      input.current.py = ((e.clientY - r.top) / r.height) * 2 - 1;
      input.current.tilt = true;
    };
    const onLeave = () => {
      input.current.px = 0;
      input.current.py = 0;
      input.current.tilt = false;
    };
    if (fine) {
      section.addEventListener("pointermove", onMove);
      section.addEventListener("pointerleave", onLeave);
    }

    return () => {
      trigger.kill();
      io.disconnect();
      section.removeEventListener("pointermove", onMove);
      section.removeEventListener("pointerleave", onLeave);
      delete stage.dataset.live;
    };
  }, []);

  return (
    <div ref={host} aria-hidden className="absolute inset-0">
      <Canvas
        orthographic
        flat
        frameloop={visible ? "always" : "never"}
        dpr={[1, phone ? 1.5 : 2]}
        // Measure the layout size, not the on-screen box: the intro scales the stage while the
        // scene mounts, and a scaled measure would size the canvas too big and crop its bottom.
        resize={{ offsetSize: true }}
        camera={{ position: [0, 0, 10], zoom: 100, near: 0.1, far: 50 }}
        gl={{ alpha: true, antialias: true, powerPreference: "low-power" }}
        onCreated={({ gl }) => {
          // Swap the still for the live scene once the first frames are on screen.
          requestAnimationFrame(() =>
            requestAnimationFrame(() => {
              const stage = gl.domElement.closest<HTMLElement>("[data-hero-stage]");
              if (stage) stage.dataset.live = "true";
            }),
          );
        }}
      >
        <FitCamera />
        {/* Warm key light from the upper left, a soft fill from the camera, a peach bounce below */}
        <hemisphereLight args={["#FFF6EE", "#F2C6A4", 1.5]} />
        <directionalLight position={[-4, 6, 6]} intensity={1.6} color="#FFF3EA" />
        <directionalLight position={[0, 0, 10]} intensity={0.9} color="#FFFFFF" />
        <directionalLight position={[5, -3, 4]} intensity={0.3} color="#F8A97A" />
        <Scene input={input} detail={detail} />
      </Canvas>
    </div>
  );
}
