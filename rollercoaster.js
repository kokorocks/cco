import {
  BufferAttribute,
  BufferGeometry,
  Quaternion,
  Vector3,
  Euler
} from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';

// Helper: Spherical linear interpolation for Euler angles
function lerpAngle(a, b, t) {
  let diff = b - a;
  while (diff > Math.PI) diff -= 2 * Math.PI;
  while (diff < -Math.PI) diff += 2 * Math.PI;
  return a + diff * t;
}

// Helper: SLERP between two Euler rotations (as XYZ order)
function lerpEuler(e0, e1, t) {
  return new Euler(
    lerpAngle(e0.x, e1.x, t),
    lerpAngle(e0.y, e1.y, t),
    lerpAngle(e0.z, e1.z, t),
    "XYZ"
  );
}

/**
 * points: Array of [x, y, z, zrot] OR [x, y, z, xrot, yrot, zrot]
 *    - xrot, yrot, zrot are in radians and optional (default 0)
 * divisions: number of segments to build
 * options: { colorFunc, ... }
 */
class CustomRollerCoasterGeometry extends BufferGeometry {
  constructor(points, divisions = 300, options = {}) {
    super();

    const vertices = [];
    const normals = [];
    const colors = [];

    const colorFunc = options.colorFunc || ((t, type) => [1, 1, 1]);
    const railRadius = options.railRadius || 0.06;
    const railSides = options.railSides || 8;

    // Prepare arrays for positions and rotations
    const positions = points.map(p => new Vector3(p[0], p[1], p[2]));
    const eulers = points.map(p => {
      // [x, y, z, xrot, yrot, zrot] or [x, y, z, zrot]
      if (p.length >= 6) return new Euler(p[3] || 0, p[4] || 0, p[5] || 0, "XYZ");
      return new Euler(0, 0, p[3] || 0, "XYZ"); // Only zrot supplied
    });

    // Interpolator for position and rotation
    function getAt(t) {
      const L = positions.length - 1;
      const idx = Math.floor(t * L);
      const t0 = idx / L, t1 = (idx + 1) / L;
      const localT = (t - t0) / (t1 - t0);

      const p0 = positions[idx], p1 = positions[Math.min(idx + 1, L)];
      const pos = new Vector3().lerpVectors(p0, p1, localT);

      const e0 = eulers[idx], e1 = eulers[Math.min(idx + 1, L)];
      const e = lerpEuler(e0, e1, localT);
      const quat = new Quaternion().setFromEuler(e);

      // Tangent is useful for train/camera orientation
      const tangent = new Vector3().subVectors(p1, p0).normalize();

      return { pos, quat, tangent };
    }

    // Build a ring for the rail cross-section
    function makeRailRing(radius, sides) {
      const ring = [];
      for (let i = 0; i < sides; ++i) {
        const theta = (i / sides) * Math.PI * 2;
        ring.push(new Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
      }
      return ring;
    }
    const ring = makeRailRing(railRadius, railSides);

    // Extrude the tube along the track using the per-point rotation
    for (let i = 0; i < divisions; ++i) {
      const t0 = i / divisions, t1 = (i + 1) / divisions;
      const { pos: p0, quat: q0 } = getAt(t0);
      const { pos: p1, quat: q1 } = getAt(t1);

      const color = colorFunc(t0, 1);

      for (let j = 0; j < railSides; ++j) {
        const v0 = ring[j].clone().applyQuaternion(q0).add(p0);
        const v1 = ring[(j + 1) % railSides].clone().applyQuaternion(q0).add(p0);
        const v2 = ring[(j + 1) % railSides].clone().applyQuaternion(q1).add(p1);
        const v3 = ring[j].clone().applyQuaternion(q1).add(p1);

        // Triangles
        vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v3.x, v3.y, v3.z);
        vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);

        // Approximate normals (out from center)
        const n0 = ring[j].clone().normalize().applyQuaternion(q0);
        const n1 = ring[(j + 1) % railSides].clone().normalize().applyQuaternion(q0);
        const n2 = ring[(j + 1) % railSides].clone().normalize().applyQuaternion(q1);
        const n3 = ring[j].clone().normalize().applyQuaternion(q1);

        normals.push(n0.x, n0.y, n0.z, n1.x, n1.y, n1.z, n3.x, n3.y, n3.z);
        normals.push(n1.x, n1.y, n1.z, n2.x, n2.y, n2.z, n3.x, n3.y, n3.z);

        for (let k = 0; k < 6; ++k) colors.push(...color);
      }
    }

    this.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    this.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  }
}

export { CustomRollerCoasterGeometry };
