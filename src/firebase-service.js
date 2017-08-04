const firebase = require('firebase');
const uuid = require('uuid');

function setupService() {
  const listeningOnRefs = [];
  let db = null;

  const listenOnRefWithQuery = (ref, {orderBy, startAt} = {}) => {
    if (orderBy) {
      ref = ref.orderByChild(orderBy);
    }
    if (startAt) {
      ref = ref.startAt(startAt);
    }
    return {
      when: event => ({
        call: callback => {
          ref.on(event, snapshot => {
            try {
              const returnValue = callback({
                //these are the fields available in the callback from a listener
                key: snapshot.key,
                value: snapshot.val(),
                ref: snapshot.ref //a ref that can be used in listenOnRef
              });
              if (returnValue && typeof returnValue.catch === 'function') {
                returnValue.catch(console.error);
              }
            } catch (e) {
              console.error(e);
            }

          });
          listeningOnRefs.push(ref);

        }
      })
    };
  };

  return {
    connect: (options, authKey) => Promise
      .resolve()
      .then(() => firebase.initializeApp(options, uuid()))
      .then(app => app.auth()
        .signInWithCustomToken(authKey)
        .then(() => {
          db = app.database();
        })),
    disconnect: () => {
      listeningOnRefs.forEach(r => r.off());
      listeningOnRefs.length = 0;
      db = null;
    },
    isConnected: () => !!db,
    getFirebaseServerTime: serverTimePath => {
      const ref = db.ref(serverTimePath);
      return ref
        .set(firebase.database.ServerValue.TIMESTAMP)
        .then(() => ref
          .once('value')
          .then(snapshot => snapshot.val())
        );
    },
    getValuesAtPath: ({path}) => db.ref(path)
      .once('value')
      .then(snapshot => snapshot.val()),
    listenOnRef: (ref, options) => {
      return listenOnRefWithQuery(ref, options);
    },
    listenOnPath: (path, options) => {
      if (!db) {
        throw 'You must connect before trying to listen to firebase paths';
      }
      const ref = db.ref(path);
      return listenOnRefWithQuery(ref, options);
    },
  };
}

class FirebaseService {

  constructor() {
    const service = setupService();
    Object.assign(this, service);
  }
}

Object.assign(FirebaseService, setupService());

module.exports = FirebaseService;
