import axios from 'axios';
import dotenv from 'dotenv';

interface BeatmapPlaycountDict {
  [key: number]: number;
}

interface Request {
  type: 'most_played',
  user_id: number,
  limit: number,
  offset: number
}

interface Beatmap {
  id: number,
  url: string,
  version: string,
  difficulty: number,
  last_updated: EpochTimeStamp,
  status: string,
  od: number,
  ar: number,
  cs: number,
  hp: number,
  bpm: number, 
  count_circles: number,
  count_sliders: number,
  count_spinners: number,
}

interface Score {
  id: number,
  accuracy: number,
  date: EpochTimeStamp,
  max_combo: number,
  mods: string[],
  pp: number,
  rank: string,
  score: number,
  count_50: number,
  count_100: number,
  count_300: number,
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
  try {
    const resp = await axios.get(`${API_URL}/beatmaps/${beatmap_id}/scores/users/${user_id}`, {
      headers: {
        "Authorization": `Bearer ${token}`
      }
    });
    return resp.data;
  } catch(err) {
    console.error(`Error: ${beatmap_id}`);
  }
}

async function getMostPlayedBeatmaps(request: Request, token: string): Promise<BeatmapPlaycountDict> {
  const dict: BeatmapPlaycountDict = {};
  const resp = await axios.get(`${API_URL}/users/${request.user_id}/beatmapsets/most_played?limit=${request.limit}&offset=${request.offset}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  
  for (const map of resp.data) {
    dict[parseInt(map.beatmap_id)] = map.count;
  }

  return dict;
}

async function getPlayedBeatmapDict(request_queue: Request[], token: string): Promise<BeatmapPlaycountDict> {
  let beatmap_playcount_dict: BeatmapPlaycountDict = {};

  const promises = request_queue.map(async (r, index) => {
    return new Promise(resolve => {
      setTimeout(async () => {
        console.log(r);
        const res = await getMostPlayedBeatmaps(r, token);
        Object.assign(beatmap_playcount_dict, res);
        resolve(null);
      }, index*100)
    })
  });
  await Promise.all(promises);
  return beatmap_playcount_dict;
}

async function getAllUserScores(user_id: number, map_dict: BeatmapPlaycountDict, token: string) {
  const scores: any[] = [];
  const promises = [];
  let index = 0;

  for (const key in map_dict) {
    // Do some logic here later on to determine if we should fetch scores ( if playcount has changed )
    if (true) {
      const map_id = parseInt(key);
      const play_count = map_dict[key];
      promises.push(new Promise(resolve => {
        setTimeout(async () => {
          const score = await getUserBeatmapScore(user_id, map_id, token);
          scores.push(score);
          resolve(null);
        }, (index++)*100)
      }))
    }
  }

  await Promise.all(promises);
  return scores;
}

async function getBeatmap(map_id: number, token: string) {
  const resp = await axios.get(`${API_URL}/beatmaps/lookup?id=${map_id}`, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  });
  console.log(resp.data);
}

(async () => {
  const user_id = 14852499;
  const token = await getUserOAUTHToken();
  //const played_beatmap_count = await getPlayedBeatmapCount(user_id, token);

  //// Since we will be making a lot of requests, it makes sense to queue them
  //const request_queue = createRequestQueue(user_id, played_beatmap_count);

  //// Return dictionary of ids ( key ) and play_count ( so it can be cached and compared against in future requests to determin if we should requst more user scores for that particular beatmap )
  //const beatmap_dict = await getPlayedBeatmapDict(request_queue, token);

  //const scores = getAllUserScores(user_id, beatmap_dict, token);
  //console.log(scores);
  
  console.log(await getUserBeatmapScore(user_id, 1872396, token));


  //console.log(played_map_ids, played_map_ids.length);
})()

