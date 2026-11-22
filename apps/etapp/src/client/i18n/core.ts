/** Core UI strings: shell, auth/join/welcome, settings. */
export const en = {

  // Shell / nav
  "nav.days": "Days",
  "nav.trip": "Trip",

  // Notices and errors
  "notice.invalidRecovery": "The recovery link is invalid or has been replaced. Ask the trip's admin for a new one.",

  // Welcome / join / create
  "welcome.createFirst": "Create your first roadtrip. You get an invite link to share with your travel companions.",
  "welcome.needInvite": "You need an invite link from the trip's admin to get started.",
  "welcome.adminSignIn": "Sign in as admin",
  "trip.name": "Trip name",
  "trip.namePlaceholder": "Roadtrip Norway",
  "trip.yourDisplayName": "Your display name",
  "trip.create": "Create trip",


  // Settings
  "settings.trip": "Trip",
  "settings.members": "Travellers",
  "settings.confirmRemove": "Remove {name} from the trip?",
  "settings.createAnother": "Create another trip",
  "settings.newTrip": "New trip",
};

export const sv: Record<keyof typeof en, string> = {

  "nav.days": "Dagar",
  "nav.trip": "Resa",

  "notice.invalidRecovery": "Återställningslänken är ogiltig eller har ersatts. Be resans admin om en ny.",

  "welcome.createFirst": "Skapa din första roadtrip. Du får en inbjudningslänk att dela med de du reser med.",
  "welcome.needInvite": "Du behöver en inbjudningslänk från resans admin för att komma igång.",
  "welcome.adminSignIn": "Logga in som admin",
  "trip.name": "Resans namn",
  "trip.namePlaceholder": "Bilresa Norge",
  "trip.yourDisplayName": "Ditt visningsnamn",
  "trip.create": "Skapa resa",


  "settings.trip": "Resa",
  "settings.members": "Resenärer",
  "settings.confirmRemove": "Ta bort {name} från resan?",
  "settings.createAnother": "Skapa en till resa",
  "settings.newTrip": "Ny resa",
};
