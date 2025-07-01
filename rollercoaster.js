import {
  BufferAttribute,
  BufferGeometry,
  Quaternion,
  Vector3
} from 'three';

/**
 * RollerCoasterTrackGeometry: flexible roller coaster track geometry.
 *
 * @param {Curve} curve - The path curve
 * @param {number} divisions - Number of divisions along the path
 * @param {Object} options - Options: { bankFunc, colorFunc, coasterType }
 */
class RollerCoasterTrackGeometry extends BufferGeometry {
  constructor(curve, divisions, options = {}) {
    super();

    const vertices = [];
    const normals = [];
    const colors = [];

    // Default color functions and coaster types
    const defaultColor1 = [1, 1, 1];
    const defaultColor2 = [1, 1, 0];
    const bankFunc = options.bankFunc || (() => 0); // (t) => radians
    const colorFunc = options.colorFunc || ((t, type) => (type === 1 ? defaultColor1 : defaultColor2));
    const coasterType = options.coasterType || 'B&M';

    // Cross-sections for coaster styles
    const PI2 = Math.PI * 2;
    function makeTube(sides, radius) {
      const arr = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * PI2;
        arr.push(new Vector3(Math.sin(angle) * radius, Math.cos(angle) * radius, 0));
      }
      return arr;
    }
    const crossSections = {
      'B&M': [makeTube(5, 0.06), makeTube(6, 0.025), makeTube(6, 0.025)],
      'skeleton': [makeTube(4, 0.03)],
      'default': [makeTube(5, 0.06), makeTube(6, 0.025), makeTube(6, 0.025)]
    };

    // "Step" shape for cross ties (could be omitted or customized)
    const step = [
      new Vector3(-0.225, 0, 0),
      new Vector3(0, -0.050, 0),
      new Vector3(0, -0.175, 0),
      new Vector3(0, -0.050, 0),
      new Vector3(0.225, 0, 0),
      new Vector3(0, -0.175, 0)
    ];

    const up = new Vector3(0, 1, 0);
    const forward = new Vector3();
    const right = new Vector3();
    const quaternion = new Quaternion();
    const prevQuaternion = new Quaternion();
    prevQuaternion.setFromAxisAngle(up, Math.PI / 2);

    const point = new Vector3();
    const prevPoint = new Vector3();
    prevPoint.copy(curve.getPointAt(0));

    // Helper for drawing cross ties (optional)
    function drawShape(shape, color) {
      const vector = new Vector3();
      const normal = new Vector3(0, 0, -1).applyQuaternion(quaternion);
      for (let j = 0; j < shape.length; j++) {
        vector.copy(shape[j]).applyQuaternion(quaternion).add(point);
        vertices.push(vector.x, vector.y, vector.z);
        normals.push(normal.x, normal.y, normal.z);
        colors.push(...color);
      }
    }

    // Extrude helper for tubes
    function extrudeShape(shape, offset, color) {
      const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), v4 = new Vector3();
      const n1 = new Vector3(), n2 = new Vector3(), n3 = new Vector3(), n4 = new Vector3();
      for (let j = 0, jl = shape.length; j < jl; j++) {
        const p1 = shape[j], p2 = shape[(j + 1) % jl];
        v1.copy(p1).add(offset).applyQuaternion(quaternion).add(point);
        v2.copy(p2).add(offset).applyQuaternion(quaternion).add(point);
        v3.copy(p2).add(offset).applyQuaternion(prevQuaternion).add(prevPoint);
        v4.copy(p1).add(offset).applyQuaternion(prevQuaternion).add(prevPoint);

        // Two triangles per segment
        vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v4.x, v4.y, v4.z);
        vertices.push(v2.x, v2.y, v2.z, v3.x, v3.y, v3.z, v4.x, v4.y, v4.z);

        // Normals (approximate)
        n1.copy(p1).applyQuaternion(quaternion).normalize();
        n2.copy(p2).applyQuaternion(quaternion).normalize();
        n3.copy(p2).applyQuaternion(prevQuaternion).normalize();
        n4.copy(p1).applyQuaternion(prevQuaternion).normalize();

        normals.push(n1.x, n1.y, n1.z, n2.x, n2.y, n2.z, n4.x, n4.y, n4.z);
        normals.push(n2.x, n2.y, n2.z, n3.x, n3.y, n3.z, n4.x, n4.y, n4.z);

        for (let k = 0; k < 6; k++) colors.push(...color);
      }
    }

    const offset = new Vector3();
    const section = crossSections[coasterType] || crossSections['default'];

    for (let i = 1; i <= divisions; i++) {
      const t = i / divisions;
      point.copy(curve.getPointAt(t));
      up.set(0, 1, 0);

      forward.subVectors(point, prevPoint).normalize();
      right.crossVectors(up, forward).normalize();
      up.crossVectors(forward, right);

      /*// Z rotation/banking
      const baseAngle = Math.atan2(forward.x, forward.z);
      const bankAngle = bankFunc(t);
      quaternion.setFromAxisAngle(up, baseAngle);
      const bankQuat = new Quaternion().setFromAxisAngle(forward, bankAngle);
      quaternion.multiply(bankQuat);*/
      quaternion.identity(); // No rotation applied, keeps the cross-section level

      // Colors
      const color1 = colorFunc(t, 1);
      const color2 = colorFunc(t, 2);

      // Optional: cross tie every other segment
      if (i % 2 === 0 && coasterType === 'B&M') drawShape(step, color2);

      // Tubes for current style
      if (coasterType === 'skeleton') {
        extrudeShape(section[0], offset.set(0, -0.05, 0), color2);
      } else {
        extrudeShape(section[0], offset.set(0, -0.125, 0), color2);
        extrudeShape(section[1], offset.set(0.2, 0, 0), color1);
        extrudeShape(section[2], offset.set(-0.2, 0, 0), color1);
      }

      prevPoint.copy(point);
      prevQuaternion.copy(quaternion);
    }

    this.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    this.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  }
}

export { RollerCoasterTrackGeometry };
