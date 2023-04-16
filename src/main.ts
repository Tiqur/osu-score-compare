import axios from 'axios';
import dotenv from 'dotenv';

// Read enviornment variables
dotenv.config();

const API_URL = 'https://osu.ppy.sh/api/v2';
const OATH_TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;

async function getUserOAUTHToken(): Promise<string> {
  const resp = await axios.post(OATH_TOKEN_URL, {
    client_id: client_id,
    client_secret: client_secret,
    grant_type: 'client_credentials',
    scope: 'public'
  });

  return resp.data.access_token;
}

(async () => {
  const token = await getUserOAUTHToken();
  console.log(token);
})()

