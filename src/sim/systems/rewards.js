// AI-assisted (OpenAI Codex)
export function rewardSystem({ state, data, emit }) {
  const objective = data.objectives.find(({ id }) => id === state.objectiveId);
  const metrics = state.metrics;
  const plannedFood = state.crew.n * data.balance.foodPerCrew * state.solLimit;
  const food = metrics.grownKg / plannedFood;
  const discoveries = Object.values(state.journal).filter(({ transmitted }) => transmitted).length;
  const progress = { feed: food, science: discoveries, storm: metrics.stormSafe / Math.max(1, metrics.stormSols) };
  const reached = progress[objective.id] >= objective.target;
  const completed = reached && (objective.id === 'science' || state.sol >= state.solLimit);
  if (completed && !state.objectives[objective.id]?.completed) emit('objective:done', objective);
  state.objectives[objective.id] = { progress: progress[objective.id], target: objective.target, completed };
  const budget = data.difficulty[state.difficulty].budget;
  const components = {
    food: food / .5, efficiency: state.res.credits / budget, health: state.crew.health,
    science: objective.id === 'science' ? discoveries / objective.target : metrics.transmitted / 50,
    comms: metrics.transmitted / Math.max(1, metrics.transmitted + state.res.data),
    survival: metrics.stormSafe / Math.max(1, state.solLimit - Math.ceil(data.seasons.months[6].solFrom)),
    power: metrics.powerSafe / state.solLimit,
  };
  const parts = Object.fromEntries(Object.entries(objective.weights).map(([key, weight]) =>
    [key, Math.round(weight * Math.max(0, Math.min(1, components[key]))) ]));
  state.score = { parts, total: Object.values(parts).reduce((total, value) => total + value, 0) };
}
