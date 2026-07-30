"use strict";

/* Configuration de la partie en ligne (Supabase).
   La clé "publishable" est publique par conception — la sécurité
   repose sur les règles RLS côté base (voir supabase/setup.sql). */

const ONLINE_CONFIG = {
  url: "https://evsnkweaacwshbedzwjp.supabase.co",
  key: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2c25rd2VhYWN3c2hiZWR6d2pwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODU0MDI5ODIsImV4cCI6MjEwMDk3ODk4Mn0.7ZsnBKpklULk0zO-YrdOAm9LN030AgbSv1OCe4kTRLE",
  emailDomain: "rootcamp.local"
};
