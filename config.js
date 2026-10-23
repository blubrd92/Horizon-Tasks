// Horizon instance configuration.
//
// Every value that belongs to one particular copy of Horizon lives in this
// file and nowhere else. If you fork Horizon to run your own copy, this is the
// only file you need to edit.

export const config = {
  // From the Firebase console: Project settings > General > Your apps > Web app.
  // These values identify your Firebase project; they are not secrets.
  // What keeps your data private is firestore.rules, not hiding these.
  // (storageBucket is listed because the console includes it. Horizon never
  // uses Cloud Storage.)
  firebase: {
    apiKey: 'AIzaSyD89KXVnegZ_2wLWAU49sb4ZlIxA5j3tO4',
    authDomain: 'horizontasks-29d6c.firebaseapp.com',
    projectId: 'horizontasks-29d6c',
    storageBucket: 'horizontasks-29d6c.firebasestorage.app',
    messagingSenderId: '676758534417',
    appId: '1:676758534417:web:0ca5e8e0b90de7c5adf4b0',
  },

  // Who may sign in is not set here. The approved list lives in your
  // Firestore database, in a collection named "allowlist": one document per
  // person, named with their Google email in lowercase. Add or remove people
  // there in the Firebase console. (firestore.rules explains why.)

  // Phase 3: the URL of your deployed Google Apps Script web app. The
  // allowlist of user IDs it accepts lives in that script's Script Properties.
  appsScriptUrl: '',

  // The categories a brand-new user starts with. After the first sign-in,
  // each user's categories are stored with their own data and can be edited
  // there; changing this list only affects people who sign in for the first
  // time afterward. The id is what cards store, so a category can be renamed
  // later without touching its cards.
  starterCategories: [
    { id: 'collection-development', name: 'Collection Development', color: '#2F7D6B' },
    { id: 'programs', name: 'Programs', color: '#6A4FB3' },
    { id: 'digital-resources', name: 'Digital Resources', color: '#3B6FB6' },
    { id: 'saturday-pic', name: 'Saturday PIC', color: '#B07A00' },
    { id: 'admin', name: 'Admin', color: '#6B6F78' },
  ],
};
