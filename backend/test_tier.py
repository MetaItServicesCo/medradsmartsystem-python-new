import requests

# 1. Login to get token
res = requests.post("http://localhost:8000/api/v1/auth/login", data={"username":"testuser5", "password":"testpass"})
token = res.json().get("access_token")
print("Token:", token)

# 2. Add Tier
res2 = requests.put("http://localhost:8000/api/v1/facilities/1", json={"tier_id": 1}, headers={"Authorization": f"Bearer {token}"})
print(res2.status_code)
print(res2.text)
