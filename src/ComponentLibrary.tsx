import React from 'react';
import * as THREE from 'three';

export const getComponentModel = (type: string) => {
  if (type === 'ic') {
    return (
      <group>
        <mesh castShadow>
          <boxGeometry args={[0.8, 0.2, 0.8]} />
          <meshStandardMaterial color="#333333" />
        </mesh>
        {/* Add pins */}
        {[...Array(8)].map((_, i) => (
          <mesh key={i} position={[i < 4 ? -0.45 : 0.45, -0.1, (i % 4 - 1.5) * 0.2]}>
            <boxGeometry args={[0.1, 0.2, 0.05]} />
            <meshStandardMaterial color="#cccccc" />
          </mesh>
        ))}
      </group>
    );
  }
  // Resistor
  return (
    <group>
      <mesh castShadow rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 0.4, 16]} />
        <meshStandardMaterial color="#ffcc99" />
      </mesh>
      <mesh position={[-0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        <meshStandardMaterial color="#cccccc" />
      </mesh>
      <mesh position={[0.3, 0, 0]} rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.02, 0.02, 0.2, 8]} />
        <meshStandardMaterial color="#cccccc" />
      </mesh>
    </group>
  );
};
