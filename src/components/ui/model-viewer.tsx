"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { alignToPhoto, projectPhoto } from "./perfume-ring/label-projection";

/**
 * Проба настоящих 3D-моделей флаконов (Higgsfield image-to-3D → GLB).
 * Модель стоит на маленьком лакированном подиуме, её можно крутить со всех сторон.
 */

/** front — фото флакона анфас на прозрачном фоне: им заменяем сгенерированную этикетку */
export type ModelEntry = { id: string; aroma: string; engine: string; src: string; photo: string; front: string; mb: number };

const BASE = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
const GOLD = new THREE.Color("#d8b47a");

export function ModelViewer({ models }: { models: ModelEntry[] }) {
  const host = useRef<HTMLDivElement>(null);
  const api = useRef<{ show: (src: string, front: string) => void; setMix: (v: number) => void } | null>(null);
  const [cur, setCur] = useState(0);
  const [loading, setLoading] = useState(true);
  const [real, setReal] = useState(true);

  useEffect(() => {
    const el = host.current!;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const r = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    r.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.1;
    r.domElement.style.cssText = "position:absolute;inset:0;width:100%;height:100%;display:block;outline:none;cursor:grab";
    r.domElement.setAttribute("role", "img");
    r.domElement.setAttribute("aria-label", "3D-модель флакона: потяните, чтобы повернуть");
    el.appendChild(r.domElement);

    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(r);
    const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    scene.environmentIntensity = 0.9;

    const cam = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
    cam.position.set(0, 1.6, 5.6);
    const ctl = new OrbitControls(cam, r.domElement);
    ctl.target.set(0, 0.85, 0);
    ctl.enableDamping = true;
    ctl.enablePan = false;
    ctl.minDistance = 2.4;
    ctl.maxDistance = 8;
    ctl.maxPolarAngle = Math.PI * 0.52;
    ctl.autoRotate = !reduce;
    ctl.autoRotateSpeed = 1.2;

    scene.add(new THREE.AmbientLight(0xfff0e0, 0.3));
    const key = new THREE.DirectionalLight(0xffe6c4, 2.2);
    key.position.set(2.5, 4, 3);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xd8a860, 2.5);
    rim.position.set(-3, 2.5, -3);
    scene.add(rim);

    const podium = new THREE.Mesh(
      new THREE.CylinderGeometry(1.35, 1.42, 0.24, 128),
      new THREE.MeshPhysicalMaterial({ color: "#0e0806", roughness: 0.4, metalness: 0.05, clearcoat: 0.8, clearcoatRoughness: 0.2, envMapIntensity: 0.12 }),
    );
    podium.position.y = -0.12;
    scene.add(podium);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(1.37, 0.022, 16, 160), new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 }));
    ring.rotation.x = Math.PI / 2;
    scene.add(ring);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);
    let model: THREE.Object3D | null = null;
    let token = 0;
    let label: { setMix: (v: number) => void } | null = null;
    let mixNow = 1;
    const texLoader = new THREE.TextureLoader();
    const loadImg = (src: string) =>
      new Promise<HTMLImageElement>((ok, fail) => {
        const im = new Image();
        im.onload = () => ok(im);
        im.onerror = fail;
        im.src = src;
      });
    const show = (src: string, front: string) => {
      const my = ++token;
      setLoading(true);
      const photo = Promise.all([loadImg(front), texLoader.loadAsync(front)]);
      loader.load(
        src,
        async (g) => {
          const [img, tex] = await photo;
          if (my !== token) return;
          if (model) {
            scene.remove(model);
            model.traverse((o) => {
              const m = o as THREE.Mesh;
              m.geometry?.dispose();
              (Array.isArray(m.material) ? m.material : m.material ? [m.material] : []).forEach((x) => x.dispose());
            });
          }
          model = g.scene;
          // ставим на подиум: высота 1.7, лицом (как на фото) к зрителю, по центру
          const box = new THREE.Box3().setFromObject(model);
          const size = box.getSize(new THREE.Vector3());
          const k = 1.7 / size.y;
          model.scale.setScalar(k);
          alignToPhoto(r, model, img);
          const b2 = new THREE.Box3().setFromObject(model);
          const c = b2.getCenter(new THREE.Vector3());
          model.position.x -= c.x;
          model.position.z -= c.z;
          model.position.y -= b2.min.y;
          model.traverse((o) => {
            const m = o as THREE.Mesh;
            if (m.isMesh) {
              const mats = Array.isArray(m.material) ? m.material : [m.material];
              mats.forEach((mat) => {
                const sm = mat as THREE.MeshStandardMaterial;
                if (sm.map) sm.map.anisotropy = r.capabilities.getMaxAnisotropy();
                sm.envMapIntensity = 1;
              });
            }
          });
          tex.colorSpace = THREE.SRGBColorSpace;
          tex.anisotropy = r.capabilities.getMaxAnisotropy();
          scene.add(model);
          label = projectPhoto(model, img, tex);
          label.setMix(mixNow);
          setLoading(false);
        },
        undefined,
        () => my === token && setLoading(false),
      );
    };
    api.current = {
      show,
      setMix: (v) => {
        mixNow = v;
        label?.setMix(v);
      },
    };

    const resize = () => {
      const w = el.clientWidth;
      const h = el.clientHeight;
      r.setSize(w, h, false);
      cam.aspect = w / h;
      // на телефоне модель выше, под ней — подписи
      cam.setViewOffset(w, h, 0, w / h < 0.85 ? h * 0.08 : 0, w, h);
      cam.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);
    resize();

    let raf = 0;
    const tick = () => {
      ctl.update();
      r.render(scene, cam);
      raf = requestAnimationFrame(tick);
    };
    tick();
    const grab = () => (r.domElement.style.cursor = "grabbing");
    const release = () => (r.domElement.style.cursor = "grab");
    r.domElement.addEventListener("pointerdown", grab);
    window.addEventListener("pointerup", release);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      ctl.dispose();
      r.domElement.removeEventListener("pointerdown", grab);
      window.removeEventListener("pointerup", release);
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose();
      });
      env.dispose();
      pmrem.dispose();
      r.dispose();
      r.domElement.remove();
    };
  }, []);

  useEffect(() => {
    api.current?.show(`${BASE}${models[cur].src}`, `${BASE}${models[cur].front}`);
  }, [cur, models]);
  useEffect(() => {
    api.current?.setMix(real ? 1 : 0);
  }, [real]);

  const m = models[cur];
  return (
    <>
      <div ref={host} className="absolute inset-0" />
      <AnimatePresence>
        {loading && (
          <motion.p
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            role="status"
            className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-[11px] uppercase tracking-[0.3em] text-soft"
          >
            Загружаем модель · {m.mb.toFixed(1)} МБ
          </motion.p>
        )}
      </AnimatePresence>

      <div className="absolute inset-x-0 bottom-0 z-10 flex flex-col items-center gap-4 bg-gradient-to-t from-night via-night/80 to-transparent px-4 pb-6 pt-16">
        <div className="text-center">
          <p className="text-[11px] font-medium uppercase tracking-[0.3em] text-gold">{m.engine}</p>
          <p className="mt-1.5 text-xl font-light uppercase tracking-[0.12em]">{m.aroma}</p>
          <p className="mt-1 text-sm text-soft">Потяните, чтобы покрутить · колесо или щипок — приблизить</p>
        </div>
        <div role="radiogroup" aria-label="Этикетка" className="flex gap-1 rounded-full p-1 ring-1 ring-gold/30">
          {[
            [true, "Этикетка с фото"],
            [false, "Как сгенерировано"],
          ].map(([v, t]) => (
            <button
              key={String(v)}
              type="button"
              role="radio"
              aria-checked={real === v}
              onClick={() => setReal(v as boolean)}
              className={`min-h-9 rounded-full px-3.5 text-[11px] uppercase tracking-[0.14em] transition-colors ${
                real === v ? "bg-gold text-night" : "text-ink/75 hover:text-ink"
              }`}
            >
              {t}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label="Модель" className="flex flex-wrap justify-center gap-2">
          {models.map((x, i) => (
            <button
              key={x.id}
              type="button"
              role="radio"
              aria-checked={i === cur}
              onClick={() => setCur(i)}
              className={`min-h-11 rounded-full px-4 text-xs uppercase tracking-[0.14em] transition-colors ${
                i === cur ? "bg-ink text-night" : "text-ink/80 ring-1 ring-ink/20 hover:ring-ink/45"
              }`}
            >
              {x.aroma.split(" ")[0]} · {x.engine.split(" ")[0]}
            </button>
          ))}
        </div>
      </div>

      {/* исходное фото — для сравнения */}
      <figure className="absolute right-4 top-[7.5rem] z-10 w-20 rounded-xl bg-ink/5 p-2 ring-1 ring-ink/10 backdrop-blur sm:right-8 sm:top-28 sm:w-28">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={`${BASE}${m.photo}`} alt={`Фото: ${m.aroma}`} className="mx-auto h-24 w-auto object-contain sm:h-36" />
        <figcaption className="mt-1 text-center text-[10px] uppercase tracking-[0.2em] text-soft">Фото</figcaption>
      </figure>
    </>
  );
}
