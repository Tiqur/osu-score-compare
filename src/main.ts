import axios from 'axios';
import dotenv from 'dotenv';

interface Request {
  type: 'most_played',
  user_id: number,
  limit: number,
  offset: number
}

// Read enviornment variables
dotenv.config();

// Constants
const API_URL = 'https://osu.ppy.sh/api/v2';
const OATH_TOKEN_URL = 'https://osu.ppy.sh/oauth/token';
const client_id = process.env.CLIENT_ID;
const client_secret = process.env.CLIENT_SECRET;

// Set default headers
axios.defaults.headers.common['Accept'] = 'application/json';
axios.defaults.headers.common['Content-Type'] = 'application/json';

// Since we will be making a lot of requests, it makes sense to queue them
const request_queue: Request[] = [];

async function getUserOAUTHToken(): Promise<string> {
  const resp = await axios.post(OATH_TOKEN_URL, {
    client_id: client_id,
    client_secret: client_secret,
    grant_type: 'client_credentials',
    scope: 'public'
  });

  return resp.data.access_token;
}

async function getPlayedBeatmapCount(user_id: number, token: string): Promise<number> {
  const resp = await axios.get(`${API_URL}/users/${user_id}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  return resp.data.beatmap_playcounts_count;
}

async function createRequestQueue(user_id: number, played_beatmap_count: number) {
  const max_limit = 100;
  
  // Create request queue with max response of 100 items
  for (let offset = 0; played_beatmap_count-offset > 0; offset+=max_limit) {
    const limit = Math.min(max_limit, played_beatmap_count-offset);

    request_queue.push({
      type: 'most_played',
      user_id: user_id,
      limit: limit,
      offset: offset
    });
  }
}


 // const resp = await axios.get(`${API_URL}/users/${user_id}/beatmapsets/most_played?limit=${limit}&offset=${offset}`, {
 //   headers: {
 //     "Authorization": `Bearer ${oauth_token}`
 //   }
 // });
 // console.log(resp.data.length);
(async () => {
  const user_id = 14852499;
  const token = await getUserOAUTHToken();
  const played_beatmap_count = await getPlayedBeatmapCount(user_id, token);
  createRequestQueue(user_id, played_beatmap_count);
  console.log(request_queue);
})()

