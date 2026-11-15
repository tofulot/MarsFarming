// AI-assisted (OpenAI Codex; broken comms dish by Claude Code)
import { commsThroughput } from './supply.js';

export function economySystem({ state, data }) {
  state.power.comms = commsThroughput(state, data);
  let capacity = state.power.comms;
  while (capacity > 0 && state.metrics.packets.length) {
    const packet = state.metrics.packets[0];
    const sent = Math.min(capacity, packet.amount);
    packet.amount -= sent;
    capacity -= sent;
    state.res.data -= sent;
    state.res.sp += sent;
    state.metrics.transmitted += sent;
    if (packet.amount === 0) {
      if (packet.discovery) state.journal[packet.discovery].transmitted = true;
      state.metrics.packets.shift();
    }
  }
}
