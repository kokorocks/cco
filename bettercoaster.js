import {
  BufferAttribute,
  BufferGeometry,
  Quaternion,
  Vector3,
  Matrix4
} from 'three';

class RollerCoasterTrackGeometry extends BufferGeometry {
  /**
   * @param {Curve} curve
   * @param {number} divisions
   * @param {Object} options
   *        - bankKeyframes: [{percent: number, angle: radians}, …]
   *        - colorFunc(t, type)
   *        - coasterType
   */
  constructor(curve, divisions, options = {}) {
    super();

    const vertices = [];
    const normals  = [];
    const colors   = [];

    // Extract or default options
    const coasterType     = options.coasterType || 'B&M';
    const colorFunc       = options.colorFunc ||
      ((t, type) => type === 1 ? [1,1,1] : [1,1,0]);

    // Prepare and sort bank keyframes at normalized t
    const rawKeys = Array.isArray(options.bankKeyframes)
      ? options.bankKeyframes
      : [];
    const bankKeys = rawKeys
      .map(k => ({ t: k.percent / 100, angle: k.angle }))
      .sort((a,b) => a.t - b.t);

    // Return bank angle via linear interpolation
    function getBankAngle(t) {
      const n = bankKeys.length;
      if (n === 0) return 0;
      if (t <= bankKeys[0].t) return bankKeys[0].angle;
      if (t >= bankKeys[n-1].t) return bankKeys[n-1].angle;
      // find segment
      for (let i = 0; i < n - 1; i++) {
        const a = bankKeys[i], b = bankKeys[i+1];
        if (t >= a.t && t <= b.t) {
          const f = (t - a.t) / (b.t - a.t);
          return a.angle + f * (b.angle - a.angle);
        }
      }
      return 0;
    }

    // Tube-section generators
    const PI2 = Math.PI * 2;
    function makeTube(sides, radius) {
      const arr = [];
      for (let i = 0; i < sides; i++) {
        const ang = (i / sides) * PI2;
        arr.push(
          new Vector3(Math.sin(ang)*radius, Math.cos(ang)*radius, 0)
        );
      }
      return arr;
    }

    const crossSections = {
      'B&M':       [makeTube(5,0.06), makeTube(6,0.025), makeTube(6,0.025)],
      'skeleton':  [makeTube(4,0.03)],
      'default':   [makeTube(5,0.06), makeTube(6,0.025), makeTube(6,0.025)]
    };
    const section = crossSections[coasterType] || crossSections['default'];

    // Reusable vectors/quaternions
    const up         = new Vector3(0,1,0);
    const forward    = new Vector3();
    const right      = new Vector3();
    const quaternion = new Quaternion();
    const prevQuat   = new Quaternion();
    const point      = new Vector3();
    const prevPoint  = new Vector3();

    prevPoint.copy(curve.getPointAt(0));

    // Helper: extrude tube shape between this and previous frame
    function extrudeShape(shape, offset, color) {
      const v = [new Vector3(),new Vector3(),new Vector3(),new Vector3()];
      const n = [new Vector3(),new Vector3(),new Vector3(),new Vector3()];

      for (let j = 0, jl = shape.length; j < jl; j++) {
        const p1 = shape[j], p2 = shape[(j+1)%jl];
        v[0].copy(p1).add(offset).applyQuaternion(quaternion).add(point);
        v[1].copy(p2).add(offset).applyQuaternion(quaternion).add(point);
        v[2].copy(p2).add(offset).applyQuaternion(prevQuat).add(prevPoint);
        v[3].copy(p1).add(offset).applyQuaternion(prevQuat).add(prevPoint);

        // Two triangles
        vertices.push(
          v[0].x,v[0].y,v[0].z,  v[1].x,v[1].y,v[1].z,  v[3].x,v[3].y,v[3].z,
          v[1].x,v[1].y,v[1].z,  v[2].x,v[2].y,v[2].z,  v[3].x,v[3].y,v[3].z
        );

        // Normals approx.
        n[0].copy(p1).applyQuaternion(quaternion).normalize();
        n[1].copy(p2).applyQuaternion(quaternion).normalize();
        n[2].copy(p2).applyQuaternion(prevQuat).normalize();
        n[3].copy(p1).applyQuaternion(prevQuat).normalize();

        normals.push(
          n[0].x,n[0].y,n[0].z,  n[1].x,n[1].y,n[1].z,  n[3].x,n[3].y,n[3].z,
          n[1].x,n[1].y,n[1].z,  n[2].x,n[2].y,n[2].z,  n[3].x,n[3].y,n[3].z
        );

        for (let k=0; k<6; k++) colors.push(...color);
      }
    }

    // (Optional) cross-tie shape for B&M
    const step = [
      new Vector3(-0.225,0,0),
      new Vector3(   0,-0.050,0),
      new Vector3(   0,-0.175,0),
      new Vector3(   0,-0.050,0),
      new Vector3( 0.225,0,0),
      new Vector3(   0,-0.175,0)
    ];
    function drawShape(shape, color) {
      const normal = new Vector3(0,0,-1).applyQuaternion(quaternion);
      const tmp    = new Vector3();
      shape.forEach(pt => {
        tmp.copy(pt).applyQuaternion(quaternion).add(point);
        vertices.push(tmp.x, tmp.y, tmp.z);
        normals.push(normal.x,normal.y,normal.z);
        colors.push(...color);
      });
    }

    // Main loop
    const basisMat = new Matrix4();
    const offset   = new Vector3();

    for (let i = 1; i <= divisions; i++) {
      const t = i / divisions;
      point.copy(curve.getPointAt(t));

      // build Frenet-like frame, but no roll
      forward.subVectors(point, prevPoint).normalize();
      right.crossVectors(up, forward).normalize();
      up.crossVectors(forward, right);

      // quaternion from basis (right, up, forward)
      basisMat.makeBasis(right, up, forward);
      quaternion.setFromRotationMatrix(basisMat);

      // apply banking from keyframes
      const bankAngle = getBankAngle(t);
      if (bankAngle !== 0) {
        const bankQuat = new Quaternion()
          .setFromAxisAngle(forward, bankAngle);
        quaternion.multiply(bankQuat);
      }

      // colors for this segment
      const c1 = colorFunc(t,1);
      const c2 = colorFunc(t,2);

      // draw cross-tie every other division on B&M
      if (coasterType === 'B&M' && i % 2 === 0) {
        drawShape(step, c2);
      }

      // extrude tubes
      if (coasterType === 'skeleton') {
        extrudeShape(section[0], offset.set(0,-0.05,0), c2);
      } else {
        extrudeShape(section[0], offset.set(0,-0.125,0), c2);
        extrudeShape(section[1], offset.set(0.2,0,0),   c1);
        extrudeShape(section[2], offset.set(-0.2,0,0),  c1);
      }

      // save for next iteration
      prevPoint.copy(point);
      prevQuat.copy(quaternion);
    }

    // build attributes
    this.setAttribute('position', new BufferAttribute(new Float32Array(vertices), 3));
    this.setAttribute('normal',   new BufferAttribute(new Float32Array(normals),  3));
    this.setAttribute('color',    new BufferAttribute(new Float32Array(colors),   3));
  }
}

export { RollerCoasterTrackGeometry };
