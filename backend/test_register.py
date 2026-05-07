import requests

try:
    res = requests.post("http://localhost:8000/api/v1/auth/register", json={
        "username": "testuser3",
        "password": "testpass",
        "email": "test3@test.com",
        "full_name": "Test User 3",
        "role": "employee"
    })
    print(res.status_code)
    print(res.text)
except Exception as e:
    print(e)
