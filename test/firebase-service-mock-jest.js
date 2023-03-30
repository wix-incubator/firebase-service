function firebaseServiceWithMockFirebase(firebaseMock) {
  jest.mock('firebase/compat/app', () => firebaseMock); // eslint-disable-line no-undef
  jest.mock('firebase/compat/auth', () => {}); // eslint-disable-line no-undef
  jest.mock('firebase/compat/database', () => {}); // eslint-disable-line no-undef
  const FirebaseService = require('../src/firebase-service');
  return new FirebaseService();
}

module.exports = {
  firebaseServiceWithMockFirebase,
};
