import axios from 'axios';
import dotenv from 'dotenv';

// Read enviornment variables
dotenv.config();

const API_URL = 'https://osu.ppy.sh/api/v2';
console.log(process.env.CLIENT_ID, process.env.CLIENT_SECRET);
