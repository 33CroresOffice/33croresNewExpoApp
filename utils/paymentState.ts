const state: { active: boolean } = { active: false };

export const paymentState = {
  start() {
    state.active = true;
  },
  end() {
    state.active = false;
  },
  isActive(): boolean {
    return state.active;
  },
};
