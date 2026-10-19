'use client';

import React, { useRef, useState, useCallback } from 'react';
import { motion, useMotionValue, useSpring, useTransform } from 'framer-motion';

export interface TiltCard3DProps {
  children: React.ReactNode;
  className?: string;
  style?: React.CSSProperties;
  maxTilt?: number;
  glareColor?: string;
  glareOpacity?: number;
  translateZ?: number;
  onClick?: () => void;
}

export default function TiltCard3D({
  children,
  className = '',
  style = {},
  maxTilt = 12,
  glareColor = 'rgba(212, 175, 55, 0.16)',
  glareOpacity = 0.55,
  translateZ = 16,
  onClick,
}: TiltCard3DProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);

  // Normalized mouse coords (-0.5 to 0.5)
  const x = useMotionValue(0);
  const y = useMotionValue(0);

  // Cursor percentages for spotlight glare (0 to 100%)
  const glareX = useMotionValue(50);
  const glareY = useMotionValue(50);

  // Buttery physics springs
  const springConfig = { stiffness: 260, damping: 22 };
  const mouseXSpring = useSpring(x, springConfig);
  const mouseYSpring = useSpring(y, springConfig);

  const rotateX = useTransform(mouseYSpring, [-0.5, 0.5], [maxTilt, -maxTilt]);
  const rotateY = useTransform(mouseXSpring, [-0.5, 0.5], [-maxTilt, maxTilt]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = rect.height;

    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;

    const xPct = mouseX / width - 0.5;
    const yPct = mouseY / height - 0.5;

    x.set(xPct);
    y.set(yPct);

    glareX.set((mouseX / width) * 100);
    glareY.set((mouseY / height) * 100);
  }, [x, y, glareX, glareY]);

  const handleMouseEnter = useCallback(() => {
    setIsHovered(true);
  }, []);

  const handleMouseLeave = useCallback(() => {
    setIsHovered(false);
    x.set(0);
    y.set(0);
  }, [x, y]);

  const glareBackground = useTransform(
    [glareX, glareY],
    ([gx, gy]) =>
      `radial-gradient(circle 300px at ${gx}% ${gy}%, ${glareColor}, rgba(0, 96, 57, 0.08) 45%, transparent 75%)`
  );

  return (
    <motion.div
      ref={cardRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
      onClick={onClick}
      style={{
        transformStyle: 'preserve-3d',
        perspective: 1000,
        rotateX,
        rotateY,
        ...style,
      }}
      className={`relative overflow-hidden transition-all duration-200 select-none ${className}`}
    >
      {/* Dynamic Gold/Emerald Spotlight Glare */}
      {isHovered && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-20 transition-opacity duration-300"
          style={{
            background: glareBackground,
            opacity: glareOpacity,
          }}
        />
      )}

      {/* 3D Elevated Layer */}
      <div
        style={{
          transform: `translateZ(${translateZ}px)`,
          transformStyle: 'preserve-3d',
        }}
        className="h-full w-full"
      >
        {children}
      </div>
    </motion.div>
  );
}
