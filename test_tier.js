const http = require('http');
const querystring = require('querystring');

const loginData = querystring.stringify({ username: 'admin', password: 'password' });

const loginReq = http.request({
  hostname: 'localhost',
  port: 8000,
  path: '/api/v1/auth/login',
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
    'Content-Length': Buffer.byteLength(loginData)
  }
}, (loginRes) => {
  let body = '';
  loginRes.on('data', chunk => body += chunk);
  loginRes.on('end', () => {
    const data = JSON.parse(body);
    if (!data.access_token) {
      console.error('Login failed', body);
      return;
    }
    const token = data.access_token;
    
    // UPDATE
    const putData = JSON.stringify({ tier_id: 1 });
    const putReq = http.request({
      hostname: 'localhost',
      port: 8000,
      path: '/api/v1/facilities/1',
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': putData.length,
        'Authorization': 'Bearer ' + token
      }
    }, (res) => {
      let b = '';
      res.on('data', chunk => b += chunk);
      res.on('end', () => console.log('STATUS:', res.statusCode, 'BODY:', b));
    });
    putReq.write(putData);
    putReq.end();
  });
});
loginReq.write(loginData);
loginReq.end();
