import httpx

def main():
    # Login as superadmin to get token
    login_data = {
        "username": "superadmin@example.com",
        "password": "password"
    }
    r = httpx.post("http://localhost:8000/api/v1/auth/login", data=login_data)
    if r.status_code != 200:
        print("Login failed:", r.text)
        return
    token = r.json()["access_token"]
    
    # Fetch service requests
    headers = {"Authorization": f"Bearer {token}"}
    r = httpx.get("http://localhost:8000/api/v1/service-requests/", headers=headers)
    print("Status Code:", r.status_code)
    
    if r.status_code != 200:
        print("Error Response:", r.text)
        return
        
    data = r.json()
    print("Total:", data.get("total"))
    print("Items:", len(data.get("items", [])))
    for item in data.get("items", []):
        print(f"- {item['request_number']} | Status: {item['status']} | Created: {item['created_at']}")

if __name__ == "__main__":
    main()
