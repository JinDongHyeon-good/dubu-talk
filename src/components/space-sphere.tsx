"use client";

import { useEffect, useRef } from "react";
import * as THREE from "three";

function createSpherePoints(pointCount: number, radius: number) {
  const colors = new Float32Array(pointCount * 3);
  const positions = new Float32Array(pointCount * 3);

  for (let i = 0; i < pointCount; i += 1) {
    const t = i / pointCount;
    const phi = Math.acos(1 - 2 * t);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;

    const x = Math.sin(phi) * Math.cos(theta);
    const y = Math.cos(phi);
    const z = Math.sin(phi) * Math.sin(theta);

    const vx = x * radius;
    const vy = y * radius;
    const vz = z * radius;
    positions[i * 3] = vx;
    positions[i * 3 + 1] = vy;
    positions[i * 3 + 2] = vz;

    const mintMix = (z + 1) * 0.5;
    const hue = 0.455 + mintMix * 0.028;
    const saturation = 0.86 + mintMix * 0.08;
    const lightness = 0.38 + mintMix * 0.2;
    const color = new THREE.Color().setHSL(hue, saturation, lightness);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  return { positions, colors };
}

function createWovenRingPositions(
  radius: number,
  segments: number,
  wobbleAmplitude: number,
  wobbleFrequency: number,
  phase: number
) {
  const positions = new Float32Array((segments + 1) * 3);
  for (let i = 0; i <= segments; i += 1) {
    const t = (i / segments) * Math.PI * 2;
    const radial = radius + Math.sin(t * wobbleFrequency + phase) * wobbleAmplitude;
    const x = Math.cos(t) * radial;
    const y = Math.sin(t * 2 + phase * 0.65) * (wobbleAmplitude * 0.9);
    const z = Math.sin(t) * radial;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
  }
  return positions;
}

type SpaceSphereProps = {
  onReady?: () => void;
};

export default function SpaceSphere({ onReady }: SpaceSphereProps) {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    mount.style.visibility = "hidden";

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8.9);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.domElement.style.background = "transparent";
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.05;
    mount.appendChild(renderer.domElement);

    const group = new THREE.Group();
    scene.add(group);

    const sphereData = createSpherePoints(3600, 1.95);
    const pointsGeometry = new THREE.BufferGeometry();
    pointsGeometry.setAttribute("position", new THREE.BufferAttribute(sphereData.positions, 3));
    pointsGeometry.setAttribute("color", new THREE.BufferAttribute(sphereData.colors, 3));
    const pointsMaterial = new THREE.PointsMaterial({
      size: 0.03,
      vertexColors: true,
      transparent: true,
      opacity: 0.94,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    group.add(points);

    const innerRootsGroup = new THREE.Group();
    group.add(innerRootsGroup);
    const rootLineMaterial = new THREE.LineBasicMaterial({
      color: 0x14b894,
      transparent: true,
      opacity: 0.4,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });
    const rootGeometries: THREE.BufferGeometry[] = [];
    const rootLines: THREE.Line[] = [];
    const ringDefinitions = [
      { radius: 0.52, wobble: 0.07, freq: 4, phase: 0.2, rot: [0.2, 0.15, 0.1] as const },
      { radius: 0.63, wobble: 0.08, freq: 5, phase: 1.1, rot: [1.1, 0.4, 0.95] as const },
      { radius: 0.72, wobble: 0.09, freq: 6, phase: 2.2, rot: [0.65, 1.05, 0.35] as const },
      { radius: 0.82, wobble: 0.1, freq: 7, phase: 0.7, rot: [1.35, 0.7, 1.4] as const },
      { radius: 0.92, wobble: 0.1, freq: 8, phase: 1.8, rot: [0.35, 1.35, 0.8] as const },
      { radius: 0.58, wobble: 0.075, freq: 5, phase: 2.7, rot: [0.95, 0.25, 1.25] as const },
      { radius: 0.68, wobble: 0.085, freq: 6, phase: 3.4, rot: [0.45, 1.2, 1.05] as const },
      { radius: 0.78, wobble: 0.095, freq: 7, phase: 4.1, rot: [1.25, 0.95, 0.45] as const },
      { radius: 0.88, wobble: 0.102, freq: 8, phase: 4.8, rot: [0.75, 1.45, 0.2] as const },
      { radius: 0.54, wobble: 0.072, freq: 4, phase: 5.4, rot: [0.3, 0.65, 1.55] as const },
      { radius: 0.6, wobble: 0.08, freq: 5, phase: 6.1, rot: [1.55, 0.3, 0.7] as const },
      { radius: 0.66, wobble: 0.087, freq: 6, phase: 6.8, rot: [0.85, 1.55, 0.55] as const },
      { radius: 0.74, wobble: 0.095, freq: 7, phase: 7.5, rot: [1.45, 0.85, 1.2] as const },
      { radius: 0.8, wobble: 0.1, freq: 7, phase: 8.2, rot: [0.55, 1.05, 1.5] as const },
      { radius: 0.86, wobble: 0.103, freq: 8, phase: 8.9, rot: [1.15, 1.5, 0.4] as const },
      { radius: 0.9, wobble: 0.105, freq: 8, phase: 9.6, rot: [1.5, 0.55, 1.05] as const },
      { radius: 0.7, wobble: 0.09, freq: 6, phase: 10.3, rot: [0.95, 1.15, 1.4] as const },
      { radius: 0.84, wobble: 0.102, freq: 8, phase: 11, rot: [1.25, 0.45, 1.6] as const },
    ];

    for (const ring of ringDefinitions) {
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(createWovenRingPositions(ring.radius, 480, ring.wobble, ring.freq, ring.phase), 3)
      );
      const line = new THREE.Line(geometry, rootLineMaterial);
      line.rotation.set(ring.rot[0], ring.rot[1], ring.rot[2]);
      innerRootsGroup.add(line);
      rootGeometries.push(geometry);
      rootLines.push(line);
    }

    group.rotation.x = -0.22;
    group.rotation.z = 0.11;

    const ambient = new THREE.AmbientLight(0x9cead6, 0.72);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(0x1db892, 2.15, 34);
    pointLight.position.set(0.7, 0.15, 6.4);
    scene.add(pointLight);

    let frame = 0;
    const startedAt = performance.now();
    renderer.render(scene, camera);
    mount.style.visibility = "visible";
    onReady?.();
    const animate = () => {
      frame = requestAnimationFrame(animate);
      const elapsed = (performance.now() - startedAt) / 1000;
      group.rotation.y -= 0.00045;
      innerRootsGroup.rotation.y += 0.0058;
      innerRootsGroup.rotation.x = Math.sin(elapsed * 0.5) * 0.22;
      innerRootsGroup.scale.setScalar(1 + Math.sin(elapsed * 1.2) * 0.03);
      rootLines.forEach((line, idx) => {
        const factor = idx % 2 === 0 ? 1 : -1;
        line.rotation.z += 0.00065 * factor;
      });
      renderer.render(scene, camera);
    };
    animate();

    const onResize = () => {
      if (!mount) return;
      const nextWidth = mount.clientWidth;
      const nextHeight = mount.clientHeight;
      camera.aspect = nextWidth / nextHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(nextWidth, nextHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", onResize);
      pointsGeometry.dispose();
      pointsMaterial.dispose();
      rootGeometries.forEach((geometry) => geometry.dispose());
      rootLineMaterial.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="sphere-canvas h-[500px] w-[500px] max-w-[92vw]" aria-label="3D sphere canvas" />;
}
