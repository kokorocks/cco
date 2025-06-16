import {
  BufferAttribute,
  BufferGeometry,
  Quaternion,
  Vector3
} from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';

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
    const bankFunc = options.bankFunc || (() => 0);
    const colorFunc = options.colorFunc || ((t, type) => (type === 1 ? defaultColor1 : defaultColor2));
    const coasterType = options.coasterType || 'B&M';

    // Cross-sections for coaster styles
    const PI2 = Math.PI * 2;
    function makeTube(sides, radius) {
      const arr = [];
      for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * PI2;
        arr.push(new Vector3(Math.cos(angle) * radius, Math.sin(angle) * radius, 0));
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

    // Frame vectors
    const prevBinormal = new Vector3();
    const prevNormal = new Vector3();
    const prevTangent = new Vector3();
    let initialized = false;

    const point = new Vector3();
    const prevPoint = new Vector3();
    prevPoint.copy(curve.getPointAt(0));

    // Extrude helper for tubes
    function extrudeShape(shape, offset, color, binormal, normal, tangent, p, prevBinormal, prevNormal, prevTangent, prevP) {
      const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), v4 = new Vector3();
      const n1 = new Vector3(), n2 = new Vector3(), n3 = new Vector3(), n4 = new Vector3();
      for (let j = 0, jl = shape.length; j < jl; j++) {
        const p1 = shape[j], p2 = shape[(j + 1) % jl];

        // Position vertices using same basis as scene (binormal, normal, tangent)
        v1.copy(p1).add(offset).applyMatrix3(basisMatrix(binormal, normal, tangent)).add(p);
        v2.copy(p2).add(offset).applyMatrix3(basisMatrix(binormal, normal, tangent)).add(p);
        v3.copy(p2).add(offset).applyMatrix3(basisMatrix(prevBinormal, prevNormal, prevTangent)).add(prevP);
        v4.copy(p1).add(offset).applyMatrix3(basisMatrix(prevBinormal, prevNormal, prevTangent)).add(prevP);

        // Two triangles per segment
        vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v4.x, v4.y, v4.z);
        vertices.push(v2.x, v2.y, v2.z, v3.x, v3.y, v3.z, v4.x, v4.y, v4.z);

        // Normals (approximate: out from cross-section center)
        n1.copy(p1).applyMatrix3(basisMatrix(binormal, normal, tangent)).normalize();
        n2.copy(p2).applyMatrix3(basisMatrix(binormal, normal, tangent)).normalize();
        n3.copy(p2).applyMatrix3(basisMatrix(prevBinormal, prevNormal, prevTangent)).normalize();
        n4.copy(p1).applyMatrix3(basisMatrix(prevBinormal, prevNormal, prevTangent)).normalize();

        normals.push(n1.x, n1.y, n1.z, n2.x, n2.y, n2.z, n4.x, n4.y, n4.z);
        normals.push(n2.x, n2.y, n2.z, n3.x, n3.y, n3.z, n4.x, n4.y, n4.z);

        for (let k = 0; k < 6; k++) colors.push(...color);
      }
    }

    // Helper: create a Matrix3 from basis vectors (binormal, normal, tangent)
    function basisMatrix(bin, nor, tan) {
      // Each vector is a column in the matrix
      return {
        elements: [
          bin.x, nor.x, tan.x,
          bin.y, nor.y, tan.y,
          bin.z, nor.z, tan.z
        ],
        // Only .applyMatrix3 is used, so define that here for Vector3
        applyToVector3: function(v) {
          const e = this.elements;
          const x = v.x, y = v.y, z = v.z;
          v.x = e[0] * x + e[1] * y + e[2] * z;
          v.y = e[3] * x + e[4] * y + e[5] * z;
          v.z = e[6] * x + e[7] * y + e[8] * z;
          return v;
        }
      };
    }

    // Overwrite Vector3.applyMatrix3 for our temp matrix object
    Vector3.prototype.applyMatrix3 = function(m) {
      if (typeof m.applyToVector3 === 'function') {
        return m.applyToVector3(this);
      }
      // fallback for THREE.Matrix3
      const e = m.elements;
      const x = this.x, y = this.y, z = this.z;
      this.x = e[0] * x + e[1] * y + e[2] * z;
      this.y = e[3] * x + e[4] * y + e[5] * z;
      this.z = e[6] * x + e[7] * y + e[8] * z;
      return this;
    };

    const offset = new Vector3();
    const section = crossSections[coasterType] || crossSections['default'];

    // Initial frame at t=0
    let t = 0;
    point.copy(curve.getPointAt(t));
    const tangent = curve.getTangentAt(t).normalize();
    let binormal = new Vector3();
    let normal = new Vector3();
    // Use a fixed up vector
    const up = new Vector3(0, 1, 0);
    binormal.crossVectors(up, tangent).normalize();
    normal.crossVectors(tangent, binormal).normalize();

    prevBinormal.copy(binormal);
    prevNormal.copy(normal);
    prevTangent.copy(tangent);

    for (let i = 1; i <= divisions; i++) {
      t = i / divisions;
      point.copy(curve.getPointAt(t));
      const tangent = curve.getTangentAt(t).normalize();

      // Frame: match scene logic
      binormal.crossVectors(up, tangent).normalize();
      normal.crossVectors(tangent, binormal).normalize();

      // Banking: rotate binormal/normal around tangent
      const bankAngle = bankFunc(t);
      if (bankAngle !== 0) {
        const bankQuat = new Quaternion();
        bankQuat.setFromAxisAngle(tangent, bankAngle);
        binormal.applyQuaternion(bankQuat);
        normal.applyQuaternion(bankQuat);
      }

      // Colors
      const color1 = colorFunc(t, 1);
      const color2 = colorFunc(t, 2);

      // Tubes for current style
      if (coasterType === 'skeleton') {
        extrudeShape(section[0], offset.set(0, -0.05, 0), color2,
          binormal, normal, tangent, point,
          prevBinormal, prevNormal, prevTangent, prevPoint
        );
      } else {
        extrudeShape(section[0], offset.set(0, -0.125, 0), color2,
          binormal, normal, tangent, point,
          prevBinormal, prevNormal, prevTangent, prevPoint
        );
        extrudeShape(section[1], offset.set(0.2, 0, 0), color1,
          binormal, normal, tangent, point,
          prevBinormal, prevNormal, prevTangent, prevPoint
        );
        extrudeShape(section[2], offset.set(-0.2, 0, 0), color1,
          binormal, normal, tangent, point,
          prevBinormal, prevNormal, prevTangent, prevPoint
        );
      }

      prevPoint.copy(point);
      prevBinormal.copy(binormal);
      prevNormal.copy(normal);
      prevTangent.copy(tangent);
    }

    this.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.setAttribute('normal', new BufferAttribute(new Float32Array(normals), 3));
    this.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  }
}

export { RollerCoasterTrackGeometry };
