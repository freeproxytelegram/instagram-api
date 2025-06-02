// Load from ENV
process.loadEnvFile();

const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

const _userAgent = process.env.USER_AGENT;
const _xIgAppId = process.env.X_IG_APP_ID;

if (!_userAgent || !_xIgAppId) {
  console.error("Required headers not found in ENV. Please make sure USER_AGENT and X_IG_APP_ID are set in your .env file.");
  process.exit(1);
}

// Function to get Instagram post ID from URL string
const getId = (url) => {
  const regex = /instagram.com\/(?:[A-Za-z0-9_.]+\/)?(p|reels|reel|stories)\/([A-Za-z0-9-_]+)/;
  const match = url.match(regex);
  return match && match[2] ? match[2] : null;
};

// Function to get Instagram data from URL string using POST request to GraphQL API
const getInstagramGraphqlData = async (url) => {
  const igId = getId(url);
  if (!igId) return null; // Return null for invalid URL to handle gracefully

  const graphql = new URL(`https://www.instagram.com/api/graphql`);
  graphql.searchParams.set("variables", JSON.stringify({ shortcode: igId }));
  graphql.searchParams.set("doc_id", "10015901848480474");
  graphql.searchParams.set("lsd", "AVqbxe3J_YA");

  try {
    const response = await fetch(graphql.toString(), {
      method: "POST", // This remains POST as per your requirement
      headers: {
        "User-Agent": _userAgent,
        "Content-Type": "application/x-www-form-urlencoded",
        "X-IG-App-ID": _xIgAppId,
        "X-FB-LSD": "AVqbxe3J_YA",
        "X-ASBD-ID": "129477",
        "Sec-Fetch-Site": "same-origin"
      }
    });

    if (!response.ok) {
      console.error(`HTTP error! status: ${response.status}`);
      return null;
    }

    const json = await response.json();
    const items = json?.data?.xdt_shortcode_media;

    if (!items) return null;

    // Return relevant data for processing into desired output
    return {
      __typename: items?.__typename,
      shortcode: items?.shortcode,
      display_url: items?.display_url,
      is_video: items?.is_video,
      video_url: items?.video_url,
      caption_edges: items?.edge_media_to_caption?.edges,
      thumbnail_src: items?.thumbnail_src,
      sidecar_edges: items?.edge_sidecar_to_children?.edges,
    };

  } catch (error) {
    console.error("Error fetching Instagram data:", error);
    return null;
  }
};

// API endpoint to handle GET requests for Instagram URLs
app.get('/instagram', async (req, res) => {
  const instagramUrl = req.query.url; // Get the URL from the query parameter
  if (!instagramUrl) {
    return res.status(400).json({ code: 400, message: "Please provide an Instagram URL in the 'url' query parameter." });
  }

  const data = await getInstagramGraphqlData(instagramUrl);

  if (data) {
    const output = {
      code: 200,
      caption: data?.caption_edges?.[0]?.node?.text || "",
      cover: data?.thumbnail_src || "",
      medias: []
    };

    if (!data.is_video && !data.sidecar_edges?.length) {
      output.medias.push({ url: data.display_url, type: "image" });
    } else if (!data.is_video && data.sidecar_edges?.length) {
      for (const item of data.sidecar_edges) {
        const node = item.node;
        output.medias.push({
          url: node.is_video ? node.video_url : node.display_url,
          type: node.is_video ? "video" : "image"
        });
      }
    } else {
      output.medias.push({ url: data.video_url, type: "video" });
    }

    res.status(200).json(output);
  } else {
    res.status(404).json({ code: 404, message: "Could not fetch data from Instagram or invalid URL." });
  }
});

// Start the server
app.listen(port, () => {
  console.log(`Instagram API listener app listening on port ${port}`);
  console.log(`Access it at http://localhost:${port}/instagram?url=YOUR_INSTAGRAM_URL`);
});