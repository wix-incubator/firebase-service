const proxyquire = require('proxyquire');

function firebaseServiceWithMockFirebase(firebaseMock) {
  return proxyquire.noCallThru()('../src/firebase-service', {
    'firebase/app': firebaseMock,
    'firebase/auth': {},
    'firebase/database': {}
  });
}

module.exports = {
  firebaseServiceWithMockFirebase
};
