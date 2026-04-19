const noop = async () => {};

const stub = {
  startListening: async () => false,
  stopListening: noop,
  addListener: () => ({ remove: () => {} }),
};

export default stub;
