
function firebaseServiceWithMockFirebase(firebaseMock) {
  jest.mock('firebase/app', () => firebaseMock); //eslint-disable-line no-undef
  jest.mock('firebase/auth', () => {}); //eslint-disable-line no-undef
  jest.mock('firebase/database', () => {}); //eslint-disable-line no-undef
  const FirebaseService = require('../src/firebase-service');
  return new FirebaseService();
}

module.exports = {
  firebaseServiceWithMockFirebase
};
