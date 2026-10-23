(function (root) {
  const DT = root.DT || (typeof require !== 'undefined' ? require('../ditch/calc.js') : null);
  const G = 32.2;

  function parseStation(str) {
    if (str == null || str === '') return null;
    const s = String(str).trim();
    const m = s.match(/^(\d+)\+(\d{1,2})$/);
    if (m) return parseInt(m[1], 10) * 100 + parseInt(m[2], 10);
    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }
  function formatStation(ft) {
    if (ft == null || !Number.isFinite(ft)) return '';
    const x = Math.round(ft);
    const major = Math.floor(x / 100);
    const minor = ((x % 100) + 100) % 100;
    return major + '+' + String(minor).padStart(2, '0');
  }
  function gradeFromElevs(flFrom, flTo, length) {
    if (!(length > 0) || flFrom == null || flTo == null) return null;
    return (flFrom - flTo) / length;
  }
  function topWidth(B, Z1, Z2, Dd) {
    return (B || 0) + ((Z1 || 0) + (Z2 || 0)) * (Dd || 0);
  }
  function shapeFromRow(row) {
    const B = Number(row.B) || 0;
    const S = row.gradeOverride && row.grade != null
      ? Number(row.grade)
      : gradeFromElevs(row.flFrom, row.flTo, row.length);
    return {
      shape: B > 0 ? 'trap' : 'v',
      B, Z1: Number(row.Z1) || 0, Z2: Number(row.Z2) || 0,
      S: S || 0, Dd: Number(row.Dd) || 0
    };
  }
  /** Apply Grade % cell edit: empty clears override; typed value latches override. */
  function applyGradeInput(row, rawPct) {
    const out = Object.assign({}, row);
    if (rawPct == null || String(rawPct).trim() === '') {
      out.grade = null;
      out.gradeOverride = false;
    } else {
      const pct = Number(String(rawPct).trim());
      if (!Number.isFinite(pct)) {
        out.grade = null;
        out.gradeOverride = true;
      } else {
        out.grade = pct / 100;
        out.gradeOverride = true;
      }
    }
    return out;
  }
  function emptyRow(prev) {
    const id = 'r' + Math.random().toString(36).slice(2, 9);
    if (!prev) {
      return {
        id, staFrom: '0+00', staTo: '1+00', offFrom: '', offTo: '',
        flFrom: null, flTo: null, length: 100,
        Z1: 3, B: 2, Z2: 3, grade: null, gradeOverride: false, Dd: 2, n: 0.035, Q: null, comment: '',
        topW: null, flowDepth: null, area: null, P: null, R: null, V: null, velHead: null,
        Qfull: null, shear: null, topElevDS: null, WSEL: null, freeboard: null,
        err: null, passFb: null, passCap: null
      };
    }
    const fromFt = parseStation(prev.staTo) ?? ((parseStation(prev.staFrom) || 0) + (prev.length || 100));
    const len = 100;
    let flTo = null;
    const flFrom = prev.flTo != null ? prev.flTo : null;
    if (flFrom != null && prev.length > 0 && prev.flFrom != null && prev.flTo != null) {
      const slope = (prev.flFrom - prev.flTo) / prev.length;
      flTo = flFrom - slope * len;
    }
    return Object.assign(emptyRow(), {
      id, staFrom: formatStation(fromFt), staTo: formatStation(fromFt + len),
      offFrom: prev.offFrom, offTo: prev.offTo,
      flFrom: flFrom, flTo: flTo,
      length: len, Z1: prev.Z1, B: prev.B, Z2: prev.Z2, Dd: prev.Dd, n: prev.n, comment: prev.comment
    });
  }
  function computeRow(row) {
    const out = Object.assign({}, row, { err: null });
    if (out.gradeOverride) {
      if (out.grade == null || !Number.isFinite(Number(out.grade)) || !(Number(out.grade) > 0)) {
        out.err = 'Grade must be > 0';
        out.grade = out.grade == null || !Number.isFinite(Number(out.grade)) ? null : Number(out.grade);
        return clearComputed(out);
      }
      out.grade = Number(out.grade);
    } else {
      out.grade = gradeFromElevs(out.flFrom, out.flTo, out.length);
    }
    out.topW = (out.Dd != null) ? topWidth(out.B, out.Z1, out.Z2, out.Dd) : null;
    if (!(out.length > 0) || !(out.n > 0) || !(out.grade > 0) || out.Dd == null) {
      out.err = out.err || (out.grade != null && out.grade <= 0 ? 'Grade must be > 0' : null);
      return clearComputed(out);
    }
    const s = shapeFromRow(out);
    const L = { type: 'fixed', n: Number(out.n) };
    try {
      out.Qfull = DT.qAt(s, L, out.Dd);
      out.topElevDS = out.flTo != null ? out.flTo + out.Dd : null;
      if (out.Q != null && out.Qfull != null && out.Q > out.Qfull && out.flowDepth == null) {
        out.err = 'Design Q exceeds full-depth capacity';
      }
      if (out.flowDepth != null && out.flowDepth > 0 && out.Q != null) {
        const g = DT.geom(s, out.flowDepth);
        out.area = g.A; out.P = g.P; out.R = g.A / g.P;
        out.V = out.Q / g.A; out.velHead = (out.V * out.V) / (2 * G);
        out.shear = DT.GAM * out.R * s.S;
        out.WSEL = out.flTo != null ? out.flTo + out.flowDepth : null;
        out.freeboard = (out.topElevDS != null && out.WSEL != null) ? out.topElevDS - out.WSEL : null;
        out.passFb = out.freeboard != null ? out.freeboard >= 0.5 - 1e-9 : null;
        out.passCap = out.Qfull != null && out.Q != null ? out.Qfull >= out.Q - 1e-9 : null;
      } else {
        return clearHydraulicsKeepFull(out);
      }
    } catch (e) {
      out.err = e.message; return clearComputed(out);
    }
    return out;
  }
  function clearHydraulicsKeepFull(out) {
    return Object.assign(out, {
      area: null, P: null, R: null, V: null, velHead: null, shear: null,
      WSEL: null, freeboard: null, passFb: null, passCap: out.Qfull != null && out.Q != null ? out.Qfull >= out.Q - 1e-9 : null
    });
  }
  function clearComputed(out) {
    return Object.assign(out, {
      topW: out.topW, Qfull: null, flowDepth: null, area: null, P: null, R: null, V: null, velHead: null,
      shear: null, topElevDS: null, WSEL: null, freeboard: null, passFb: null, passCap: null
    });
  }
  function goalSeekRow(row) {
    const base = computeRow(Object.assign({}, row, { flowDepth: null }));
    if (!(base.grade > 0) || !(base.Qfull > 0)) return Object.assign(base, { flowDepth: null, err: (base.grade != null && base.grade <= 0) ? 'Grade must be > 0' : 'Incomplete inputs' });
    if (!(base.Q > 0)) return Object.assign(base, { flowDepth: null, err: 'Enter design Q' });
    const s = shapeFromRow(base);
    const L = { type: 'fixed', n: Number(base.n) };
    const Qfull = DT.qAt(s, L, base.Dd);
    if (!(Qfull >= base.Q)) {
      return Object.assign(computeRow(Object.assign(base, { flowDepth: null })), { err: 'Design Q exceeds full-depth capacity' });
    }
    const r = DT.normalDepth(s, L, base.Q);
    if (r.over || !Number.isFinite(r.d)) {
      return Object.assign(computeRow(Object.assign(base, { flowDepth: null })), { err: 'Goal Seek did not converge' });
    }
    return computeRow(Object.assign(base, { flowDepth: r.d, err: null }));
  }

  /** Fields whose edit invalidates a previously Goal-Seek'd flowDepth. */
  const DEPTH_INVALIDATING = {
    Q: 1, B: 1, Z1: 1, Z2: 1, Dd: 1, n: 1,
    gradePct: 1, flFrom: 1, flTo: 1, length: 1, grade: 1
  };

  const API = {
    parseStation, formatStation, gradeFromElevs, topWidth, shapeFromRow,
    emptyRow, computeRow, goalSeekRow, applyGradeInput, DEPTH_INVALIDATING
  };
  if (typeof module !== 'undefined') module.exports = API;
  else root.DitchTableModel = API;
})(typeof window !== 'undefined' ? window : globalThis);
