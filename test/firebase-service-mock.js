const proxyquire = require('proxyquire');

function firebaseServiceWithMockFirebase(firebaseMock) {
  const FirebaseService = proxyquire.noCallThru()('../src/firebase-service', {
    'firebase/compat/app': firebaseMock,
    'firebase/compat/auth': {},
    'firebase/database': {},
  });
  return new FirebaseService();
}

module.exports = {
  firebaseServiceWithMockFirebase,
};
