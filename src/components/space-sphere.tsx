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

    const hue = 0.45 + ((z + 1) * 0.5) * 0.05;
    const color = new THREE.Color().setHSL(hue, 0.88, 0.56 + ((z + 1) * 0.5) * 0.12);
    colors[i * 3] = color.r;
    colors[i * 3 + 1] = color.g;
    colors[i * 3 + 2] = color.b;
  }

  return { positions, colors };
}

export default function SpaceSphere() {
  const mountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const width = mount.clientWidth;
    const height = mount.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(40, width / height, 0.1, 1000);
    camera.position.set(0, 0, 8.9);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.setClearColor(0x000000, 0);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.18;
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
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const points = new THREE.Points(pointsGeometry, pointsMaterial);
    group.add(points);

    group.rotation.x = -0.22;
    group.rotation.z = 0.11;

    const ambient = new THREE.AmbientLight(0xdffff6, 0.62);
    scene.add(ambient);
    const pointLight = new THREE.PointLight(0x65ffd4, 1.85, 34);
    pointLight.position.set(0.8, 0.2, 6.6);
    scene.add(pointLight);

    let frame = 0;
    const animate = () => {
      frame = requestAnimationFrame(animate);
      group.rotation.y -= 0.00045;
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
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) {
        mount.removeChild(renderer.domElement);
      }
    };
  }, []);

  return <div ref={mountRef} className="sphere-canvas h-[500px] w-[500px] max-w-[92vw]" aria-label="3D sphere canvas" />;
}
