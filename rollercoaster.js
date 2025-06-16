import {
  BufferAttribute,
  BufferGeometry,
  Quaternion,
  Vector3
} from 'https://cdn.skypack.dev/three@0.128.0/build/three.module.js';

// Helper: Parallel transport a frame along the curve
function parallelTransportFrames(curve, segments, bankFunc) {
  const tangents = [], normals = [], binormals = [];

  // Start with a fixed initial normal (usually up)
  let prevTangent = curve.getTangentAt(0).clone().normalize();
  let normal = new Vector3(0, 1, 0);
  if (Math.abs(prevTangent.dot(normal)) > 0.999) {
    normal = new Vector3(1, 0, 0); // Avoid parallel up vector
  }
  let binormal = new Vector3().crossVectors(prevTangent, normal).normalize();
  normal.crossVectors(binormal, prevTangent).normalize();

  tangents.push(prevTangent.clone());
  normals.push(normal.clone());
  binormals.push(binormal.clone());

  for (let i = 1; i <= segments; ++i) {
    const t = i / segments;
    const tangent = curve.getTangentAt(t).clone().normalize();

    // Compute rotation to align previous tangent to current tangent
    const axis = new Vector3().crossVectors(prevTangent, tangent);
    let angle = Math.asin(axis.length());
    if (prevTangent.dot(tangent) < 0) angle = Math.PI;

    if (axis.length() > 1e-6) {
      axis.normalize();
      const q = new Quaternion().setFromAxisAngle(axis, angle);
      normal.applyQuaternion(q);
      binormal.applyQuaternion(q);
    }

    // Apply banking (roll) about the tangent
    const bank = bankFunc ? bankFunc(t) : 0;
    if (bank) {
      const qBank = new Quaternion().setFromAxisAngle(tangent, bank);
      normal.applyQuaternion(qBank);
      binormal.applyQuaternion(qBank);
    }

    tangents.push(tangent.clone());
    normals.push(normal.clone());
    binormals.push(binormal.clone());
    prevTangent = tangent;
  }
  return { tangents, normals, binormals };
}

// Geometry
class RollerCoasterTrackGeometry extends BufferGeometry {
  constructor(curve, divisions, options = {}) {
    super();

    const vertices = [];
    const normalsA = [];
    const colors = [];

    // Options
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

    const offset = new Vector3();
    const section = crossSections[coasterType] || crossSections['default'];

    // Compute parallel transport frames
    const { tangents, normals, binormals } = parallelTransportFrames(curve, divisions, bankFunc);

    // Extrude helper (same as before, but now using frames)
    function extrudeShape(shape, offset, color, i) {
      const v1 = new Vector3(), v2 = new Vector3(), v3 = new Vector3(), v4 = new Vector3();
      const n1 = new Vector3(), n2 = new Vector3(), n3 = new Vector3(), n4 = new Vector3();
      for (let j = 0, jl = shape.length; j < jl; j++) {
        const p1 = shape[j], p2 = shape[(j + 1) % jl];

        // Current and previous frames
        const bin = binormals[i], nor = normals[i], tan = tangents[i];
        const binPrev = binormals[i - 1], norPrev = normals[i - 1], tanPrev = tangents[i - 1];

        // Build basis (columns: binormal, normal, tangent)
        function basisMatrix(b, n, t) {
          return {
            elements: [
              b.x, n.x, t.x,
              b.y, n.y, t.y,
              b.z, n.z, t.z
            ],
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
        Vector3.prototype.applyMatrix3 = function(m) {
          if (typeof m.applyToVector3 === 'function') {
            return m.applyToVector3(this);
          }
          const e = m.elements;
          const x = this.x, y = this.y, z = this.z;
          this.x = e[0] * x + e[1] * y + e[2] * z;
          this.y = e[3] * x + e[4] * y + e[5] * z;
          this.z = e[6] * x + e[7] * y + e[8] * z;
          return this;
        };

        const p = curve.getPointAt(i / divisions);
        const prevP = curve.getPointAt((i - 1) / divisions);

        v1.copy(p1).add(offset).applyMatrix3(basisMatrix(bin, nor, tan)).add(p);
        v2.copy(p2).add(offset).applyMatrix3(basisMatrix(bin, nor, tan)).add(p);
        v3.copy(p2).add(offset).applyMatrix3(basisMatrix(binPrev, norPrev, tanPrev)).add(prevP);
        v4.copy(p1).add(offset).applyMatrix3(basisMatrix(binPrev, norPrev, tanPrev)).add(prevP);

        // Two triangles per segment
        vertices.push(v1.x, v1.y, v1.z, v2.x, v2.y, v2.z, v4.x, v4.y, v4.z);
        vertices.push(v2.x, v2.y, v2.z, v3.x, v3.y, v3.z, v4.x, v4.y, v4.z);

        // Normals (approximate)
        n1.copy(p1).applyMatrix3(basisMatrix(bin, nor, tan)).normalize();
        n2.copy(p2).applyMatrix3(basisMatrix(bin, nor, tan)).normalize();
        n3.copy(p2).applyMatrix3(basisMatrix(binPrev, norPrev, tanPrev)).normalize();
        n4.copy(p1).applyMatrix3(basisMatrix(binPrev, norPrev, tanPrev)).normalize();

        normalsA.push(n1.x, n1.y, n1.z, n2.x, n2.y, n2.z, n4.x, n4.y, n4.z);
        normalsA.push(n2.x, n2.y, n2.z, n3.x, n3.y, n3.z, n4.x, n4.y, n4.z);

        for (let k = 0; k < 6; k++) colors.push(...color);
      }
    }

    // Extrude actual geometry
    for (let i = 1; i <= divisions; i++) {
      const t = i / divisions;

      // Colors
      const color1 = colorFunc(t, 1);
      const color2 = colorFunc(t, 2);

      if (coasterType === 'skeleton') {
        extrudeShape(section[0], offset.set(0, -0.05, 0), color2, i);
      } else {
        extrudeShape(section[0], offset.set(0, -0.125, 0), color2, i);
        extrudeShape(section[1], offset.set(0.2, 0, 0), color1, i);
        extrudeShape(section[2], offset.set(-0.2, 0, 0), color1, i);
      }
    }

    this.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.setAttribute('normal', new BufferAttribute(new Float32Array(normalsA), 3));
    this.setAttribute('color', new BufferAttribute(new Float32Array(colors), 3));
  }
}

export { RollerCoasterTrackGeometry };
