const proxyquire = require('proxyquire');

function firebaseServiceWithMockFirebase(firebaseMock) {
  const FirebaseService = proxyquire.noCallThru()('../src/firebase-service', {
    'firebase/app': firebaseMock,
    'firebase/auth': {},
    'firebase/database': {},
  });
  return new FirebaseService();
}

module.exports = {
  firebaseServiceWithMockFirebase
};
