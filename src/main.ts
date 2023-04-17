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

function createRequestQueue(user_id: number, played_beatmap_count: number): Request[] {
  const max_limit = 100;
  const request_queue: Request[] = [];
  
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

  return request_queue;
}

async function getUserBeatmapScore(user_id: number, beatmap_id: number, token: string) {
  const resp = await axios.get(`${API_URL}/beatmaps/${beatmap_id}/scores/users/${user_id}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  console.log(resp.data);
}

async function getMostPlayedBeatmaps(request: Request, token: string): Promise<Number[]> {
  const resp = await axios.get(`${API_URL}/users/${request.user_id}/beatmapsets/most_played?limit=${request.limit}&offset=${request.offset}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  return resp.data.map((e: { beatmap_id: number }) => e.beatmap_id);
}

async function getPlayedBeatmapIDs(request_queue: Request[], token: string): Promise<Number[]> {
  let ids: Number[] = [];

  const promises = request_queue.map(async (r, index) => {
    return new Promise(resolve => {
      setTimeout(async () => {
        console.log(r);
        const res = await getMostPlayedBeatmaps(r, token);
        ids.push(...res);
        resolve(null);
      }, index*100)
    })
  });
  await Promise.all(promises);
  return ids;
}


(async () => {
  const user_id = 14852499;
  const token = await getUserOAUTHToken();
  //const played_beatmap_count = await getPlayedBeatmapCount(user_id, token);

  //// Since we will be making a lot of requests, it makes sense to queue them
  //const request_queue = createRequestQueue(user_id, played_beatmap_count);
  //const played_map_ids = await getPlayedBeatmapIDs(request_queue, token);
  //console.log(played_map_ids, played_map_ids.length);
  getUserBeatmapScore(user_id, 1872396, token);
})()

