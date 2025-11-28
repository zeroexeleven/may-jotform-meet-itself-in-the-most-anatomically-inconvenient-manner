export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    
    // CORS headers
    const corsHeaders = {
      'Access-Control-Allow-Origin': 'https://zeroexeleven.github.io',
      'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    };
    
    // Handle OPTIONS preflight
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders });
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
    
    return new Response('Not found', { status: 404, headers: corsHeaders });
  }
};
