export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers - allow both GitHub Pages and Jotform domains
    const origin = request.headers.get('Origin');
    const allowedOrigins = [
      'https://zeroexeleven.github.io',
      'https://form.jotform.com',
      'https://www.jotform.com'
    ];
    
    const corsHeaders = {
      'Access-Control-Allow-Origin': allowedOrigins.includes(origin) ? origin : 'https://zeroexeleven.github.io',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
    }
    
    // Handle proxy download of external images
    if (request.method === 'POST' && url.pathname === '/proxy') {
      try {
        const formData = await request.formData();
        const imageUrl = formData.get('url');
        
        if (!imageUrl) {
          return new Response(JSON.stringify({ error: 'No URL provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Fetch the external image (server-side, no CORS restrictions)
        const imageResponse = await fetch(imageUrl);
        
        if (!imageResponse.ok) {
          return new Response(JSON.stringify({ 
            success: false, 
            error: 'Failed to fetch image: ' + imageResponse.status 
          }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        const imageBlob = await imageResponse.blob();
        const contentType = imageResponse.headers.get('content-type') || 'image/png';
        
        // Generate unique filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const ext = contentType.split('/')[1] || 'png';
        const filename = `${timestamp}-${random}.${ext}`;
        
        // Upload to R2
        await env.IMAGE_BUCKET.put(filename, imageBlob, {
          httpMetadata: {
            contentType: contentType
          }
        });
        
        // Return public URL
        const hostedUrl = `${url.origin}/image/${filename}`;
        
        return new Response(JSON.stringify({ 
          success: true, 
          url: hostedUrl 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Handle upload
    if (request.method === 'POST' && url.pathname === '/upload') {
      try {
        const formData = await request.formData();
        const imageFile = formData.get('image');
        
        if (!imageFile) {
          return new Response(JSON.stringify({ error: 'No image provided' }), {
            status: 400,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' }
          });
        }
        
        // Generate unique filename
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const filename = `${timestamp}-${random}.png`;
        
        // Upload to R2
        await env.IMAGE_BUCKET.put(filename, imageFile, {
          httpMetadata: {
            contentType: imageFile.type || 'image/png'
          }
        });
        
        // Return public URL
        const imageUrl = `${url.origin}/image/${filename}`;
        
        return new Response(JSON.stringify({ 
          success: true, 
          url: imageUrl 
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
        
      } catch (error) {
        return new Response(JSON.stringify({ 
          success: false, 
          error: error.message 
        }), {
          status: 500,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        });
      }
    }
    
    // Handle image retrieval
    if (request.method === 'GET' && url.pathname.startsWith('/image/')) {
      const filename = url.pathname.replace('/image/', '');
      const object = await env.IMAGE_BUCKET.get(filename);
      
      if (!object) {
        return new Response('Image not found', { 
          status: 404,
          headers: corsHeaders 
        });
      }
      
      return new Response(object.body, {
        headers: {
          ...corsHeaders,
          'Content-Type': object.httpMetadata.contentType || 'image/png',
          'Cache-Control': 'public, max-age=31536000'
        }
      });
    }
    
    return new Response(JSON.stringify({ 
      success: false, 
      error: 'Not found: ' + url.pathname 
    }), { 
      status: 404, 
      headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
};
