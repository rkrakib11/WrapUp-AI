import { useEffect, useRef } from "react";
import * as THREE from "three";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

const NODE_COUNT = 120;
const LINE_COUNT = 60;
const RING_COUNT = 5;

export default function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const rafRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const scene = new THREE.Scene();

    const camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      100,
    );
    camera.position.set(0, 0, 5);

    const renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setClearColor(0x000000, 0);

    const nodePositions = new Float32Array(NODE_COUNT * 3);
    for (let i = 0; i < NODE_COUNT; i++) {
      nodePositions[i * 3 + 0] = (Math.random() - 0.5) * 10;
      nodePositions[i * 3 + 1] = (Math.random() - 0.5) * 10;
      nodePositions[i * 3 + 2] = (Math.random() - 0.5) * 10;
    }

    const nodeSizes = new Float32Array(NODE_COUNT);
    for (let i = 0; i < NODE_COUNT; i++) {
      nodeSizes[i] = 3 + Math.random() * 5;
    }

    const nodeGeometry = new THREE.BufferGeometry();
    nodeGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(nodePositions, 3),
    );
    nodeGeometry.setAttribute(
      "size",
      new THREE.BufferAttribute(nodeSizes, 1),
    );

    const spriteCanvas = document.createElement("canvas");
    spriteCanvas.width = 64;
    spriteCanvas.height = 64;
    const spriteCtx = spriteCanvas.getContext("2d")!;
    const spriteGrad = spriteCtx.createRadialGradient(32, 32, 0, 32, 32, 32);
    spriteGrad.addColorStop(0, "rgba(255,255,255,1)");
    spriteGrad.addColorStop(0.4, "rgba(255,255,255,0.8)");
    spriteGrad.addColorStop(1, "rgba(255,255,255,0)");
    spriteCtx.fillStyle = spriteGrad;
    spriteCtx.fillRect(0, 0, 64, 64);
    const nodeTexture = new THREE.CanvasTexture(spriteCanvas);

    const nodeMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uColor: { value: new THREE.Color(0x818cf8) },
        uTexture: { value: nodeTexture },
        uPixelRatio: { value: renderer.getPixelRatio() },
        uOpacity: { value: 0.9 },
      },
      vertexShader: `
        attribute float size;
        uniform float uPixelRatio;
        void main() {
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mvPosition;
          gl_PointSize = size * uPixelRatio;
        }
      `,
      fragmentShader: `
        uniform vec3 uColor;
        uniform sampler2D uTexture;
        uniform float uOpacity;
        void main() {
          float a = texture2D(uTexture, gl_PointCoord).a;
          if (a < 0.02) discard;
          gl_FragColor = vec4(uColor, a * uOpacity);
        }
      `,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
    });
    const nodes = new THREE.Points(nodeGeometry, nodeMaterial);

    const nodeGroup = new THREE.Group();
    nodeGroup.add(nodes);
    scene.add(nodeGroup);

    const sphereGeo = new THREE.SphereGeometry(1, 24, 24);
    const sphereMat = new THREE.MeshBasicMaterial({
      color: 0x6366f1,
      wireframe: true,
      transparent: true,
      opacity: 0.35,
    });
    const sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
    scene.add(sphereMesh);

    const linePositions = new Float32Array(LINE_COUNT * 2 * 3);
    for (let i = 0; i < LINE_COUNT; i++) {
      const a = Math.floor(Math.random() * NODE_COUNT);
      let b = Math.floor(Math.random() * NODE_COUNT);
      if (b === a) b = (b + 1) % NODE_COUNT;

      linePositions[i * 6 + 0] = nodePositions[a * 3 + 0];
      linePositions[i * 6 + 1] = nodePositions[a * 3 + 1];
      linePositions[i * 6 + 2] = nodePositions[a * 3 + 2];
      linePositions[i * 6 + 3] = nodePositions[b * 3 + 0];
      linePositions[i * 6 + 4] = nodePositions[b * 3 + 1];
      linePositions[i * 6 + 5] = nodePositions[b * 3 + 2];
    }
    const lineGeometry = new THREE.BufferGeometry();
    lineGeometry.setAttribute(
      "position",
      new THREE.BufferAttribute(linePositions, 3),
    );
    const lineMaterial = new THREE.LineBasicMaterial({
      color: 0x818cf8,
      transparent: true,
      opacity: 0.15,
    });
    const lines = new THREE.LineSegments(lineGeometry, lineMaterial);
    nodes.add(lines);

    const ringMeshes: THREE.Mesh[] = [];
    const ringGeometries: THREE.RingGeometry[] = [];
    const ringMaterials: THREE.MeshBasicMaterial[] = [];
    for (let i = 0; i < RING_COUNT; i++) {
      const inner = 0.8 + i * 0.4;
      const outer = inner + 0.04;
      const ringGeo = new THREE.RingGeometry(inner, outer, 64);
      const ringMat = new THREE.MeshBasicMaterial({
        color: 0x4f46e5,
        transparent: true,
        opacity: 0.1 - i * 0.008,
        side: THREE.DoubleSide,
      });
      const ring = new THREE.Mesh(ringGeo, ringMat);
      ring.position.set(0, 0, -2);
      scene.add(ring);
      ringMeshes.push(ring);
      ringGeometries.push(ringGeo);
      ringMaterials.push(ringMat);
    }

    const cameraTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: 2,
      },
    });
    cameraTimeline.to(camera.position, { z: 2, y: -3 }, 0);
    cameraTimeline.to(nodeGroup.rotation, { y: Math.PI * 0.5 }, 0);

    const ringsTimeline = gsap.timeline({
      scrollTrigger: {
        trigger: "body",
        start: "top top",
        end: "bottom bottom",
        scrub: 1.5,
      },
    });
    ringMeshes.forEach((ring, i) => {
      const target = 1.5 + i * 0.1;
      ringsTimeline.to(ring.scale, { x: target, y: target }, 0);
    });

    const animate = () => {
      nodes.rotation.y += 0.0008;
      nodes.rotation.x = Math.sin(performance.now() * 0.0002) * 0.1;
      sphereMesh.rotation.y += 0.0015;
      sphereMesh.rotation.x += 0.0004;
      renderer.render(scene, camera);
      rafRef.current = requestAnimationFrame(animate);
    };
    animate();

    const onResize = () => {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener("resize", onResize);

    return () => {
      cancelAnimationFrame(rafRef.current);
      window.removeEventListener("resize", onResize);
      ScrollTrigger.getAll().forEach((t) => t.kill());
      nodeGeometry.dispose();
      nodeMaterial.dispose();
      lineGeometry.dispose();
      lineMaterial.dispose();
      ringGeometries.forEach((g) => g.dispose());
      ringMaterials.forEach((m) => m.dispose());
      sphereGeo.dispose();
      sphereMat.dispose();
      nodeTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "fixed",
        top: 0,
        left: 0,
        width: "100vw",
        height: "100vh",
        zIndex: 0,
        pointerEvents: "none",
        willChange: "transform",
        background: "transparent",
      }}
    />
  );
}
