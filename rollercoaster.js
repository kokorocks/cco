import {
  BufferGeometry,
  BufferAttribute,
  Quaternion,
  Vector3,
  Color
} from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';

/**
 * curve: CatmullRomCurve3 (or any Curve3)
 * divisions: number of steps
 * options: {
 *   zRotations: array of radians, same length as curve.points (optional, default: all zeros)
 *   colorFunc: function(t, type) => [r,g,b]
 *   railRadius, railSides
 * }
 */
export class CustomRollerCoasterTrackGeometry extends BufferGeometry {
  constructor(curve, divisions = 300, options = {}) {
    super();

    // --- Extract points and custom zrot array ---
    const controlPoints = curve.points;
    const zRots = options.zRotations || controlPoints.map(_ => 0);

    // Helper: interpolate zRot between control points
    function getZRot(t) {
      const L = controlPoints.length - 1;
      const idx = Math.floor(t * L);
      const t0 = idx / L, t1 = (idx + 1) / L;
      const localT = (t - t0) / (t1 - t0);
      // Interpolate, handling wrapping
      let a = zRots[idx] || 0, b = zRots[Math.min(idx + 1, L)] || 0;
      // shortest path interpolation
      let diff = b - a;
      while (diff > Math.PI) diff -= 2 * Math.PI;
      while (diff < -Math.PI) diff += 2 * Math.PI;
      return a + diff * localT;
    }

    // --- Geometry params ---
    const railRadius = options.railRadius || 0.06;
    const railSides = options.railSides || 8;
    const colorFunc = options.colorFunc || ((t, type) => [1, 1, 1]);

    // --- Build cross-section ring ---
    function makeRing(radius, sides) {
      const arr = [];
      for (let i = 0; i < sides; i++) {
        const theta = (i / sides) * Math.PI * 2;
        arr.push(new Vector3(Math.cos(theta) * radius, Math.sin(theta) * radius, 0));
      }
      return arr;
    }
    const ring = makeRing(railRadius, railSides);

    // --- Build geometry ---
    const vertices = [], normals = [], colors = [];
    for (let i = 0; i < divisions; ++i) {
      const t0 = i / divisions, t1 = (i + 1) / divisions;
      // Center positions
      const pos0 = curve.getPointAt(t0);
      const pos1 = curve.getPointAt(t1);

      // Frenet frames
      const tan0 = curve.getTangentAt(t0).normalize();
      const tan1 = curve.getTangentAt(t1).normalize();

      // Default up; fallback for singularities
      let up0 = new Vector3(0, 1, 0);
      if (Math.abs(tan0.dot(up0)) > 0.99) up0 = new Vector3(1, 0, 0);
      let up1 = new Vector3(0, 1, 0);
      if (Math.abs(tan1.dot(up1)) > 0.99) up1 = new Vector3(1, 0, 0);

      // Compute base frame (binormal, normal, tangent)
      const binorm0 = new Vector3().crossVectors(up0, tan0).normalize();
      const norm0 = new Vector3().crossVectors(tan0, binorm0).normalize();
      const binorm1 = new Vector3().crossVectors(up1, tan1).normalize();
      const norm1 = new Vector3().crossVectors(tan1, binorm1).normalize();

      // Get custom zrot (roll) at this and next point
      const zrot0 = getZRot(t0);
      const zrot1 = getZRot(t1);

      // Quaternion for each frame: align Z+ to tangent, then roll by zrot
      const mat0 = new THREE.Matrix4().makeBasis(binorm0, norm0, tan0);
      const mat1 = new THREE.Matrix4().makeBasis(binorm1, norm1, tan1);
      const quat0 = new Quaternion().setFromRotationMatrix(mat0);
      const quat1 = new Quaternion().setFromRotationMatrix(mat1);
      // Now roll (z-axis) around tangent
      quat0.multiply(new Quaternion().setFromAxisAngle(tan0, zrot0));
      quat1.multiply(new Quaternion().setFromAxisAngle(tan1, zrot1));

      const color = colorFunc(t0, 1);

      for (let j = 0; j < railSides; ++j) {
        const v0 = ring[j].clone().applyQuaternion(quat0).add(pos0);
        const v1 = ring[(j + 1) % railSides].clone().applyQuaternion(quat0).add(pos0);
        const v2 = ring[(j + 1) % railSides].clone().applyQuaternion(quat1).add(pos1);
        const v3 = ring[j].clone().applyQuaternion(quat1).add(pos1);

        // Two triangles
        vertices.push(v0.x, v0.y, v0.z, v1.x, v1.y, v1.z, v3.x, v3.y, v3.z);
        vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v3.x, v3.y, v3.z);

        // Normals (approx)
        const n0 = ring[j].clone().normalize().applyQuaternion(quat0);
        const n1 = ring[(j + 1) % railSides].clone().normalize().applyQuaternion(quat0);
        const n2 = ring[(j + 1) % railSides].clone().normalize().applyQuaternion(quat1);
        const n3 = ring[j].clone().normalize().applyQuaternion(quat1);

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
