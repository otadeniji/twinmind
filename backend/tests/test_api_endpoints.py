"""
TwinMind Live Copilot API Tests

Tests validation paths, error handling, and Groq 401 passthrough.
No real Groq API key available - testing error/validation paths only.

Endpoints tested:
- GET /api/ - Health check
- POST /api/transcribe - Audio transcription proxy
- POST /api/suggestions - Live suggestions
- POST /api/expand - Expand suggestion details
- POST /api/chat - Free-form chat
"""

import pytest
import requests
import os
import io
import time

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')
DUMMY_API_KEY = "gsk_invalid_test_key"


class TestHealthEndpoint:
    """GET /api/ - Health check endpoint"""
    
    def test_health_returns_200_with_service_info(self):
        """Health endpoint returns service name and status"""
        start = time.time()
        response = requests.get(f"{BASE_URL}/api/")
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "service" in data, "Missing 'service' field"
        assert "status" in data, "Missing 'status' field"
        assert data["status"] == "ok", f"Expected status 'ok', got {data['status']}"
        assert elapsed < 5, f"Response took {elapsed}s, expected < 5s"
        print(f"✓ Health check passed: {data}")


class TestCORSHeaders:
    """CORS headers verification"""
    
    def test_cors_headers_present_on_options(self):
        """OPTIONS request returns CORS headers"""
        response = requests.options(f"{BASE_URL}/api/")
        # Check for CORS headers
        cors_header = response.headers.get('Access-Control-Allow-Origin')
        assert cors_header is not None, "Missing Access-Control-Allow-Origin header"
        print(f"✓ CORS header present: {cors_header}")
    
    def test_cors_headers_on_get(self):
        """GET request includes CORS headers"""
        response = requests.get(f"{BASE_URL}/api/")
        cors_header = response.headers.get('Access-Control-Allow-Origin')
        assert cors_header is not None, "Missing Access-Control-Allow-Origin header on GET"
        print(f"✓ CORS header on GET: {cors_header}")


class TestTranscribeEndpoint:
    """POST /api/transcribe - Audio transcription proxy"""
    
    def test_missing_file_returns_422(self):
        """Missing file parameter returns 422"""
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/transcribe",
            data={"api_key": DUMMY_API_KEY}
        )
        elapsed = time.time() - start
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        assert elapsed < 5, f"Response took {elapsed}s"
        print(f"✓ Missing file returns 422: {response.json()}")
    
    def test_missing_api_key_returns_422(self):
        """Missing api_key returns 422 (Form validation)"""
        # Create a dummy audio file
        audio_content = b"dummy audio content"
        files = {"file": ("test.webm", io.BytesIO(audio_content), "audio/webm")}
        
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/transcribe",
            files=files
        )
        elapsed = time.time() - start
        
        # FastAPI Form(...) returns 422 when required field missing
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        assert elapsed < 5, f"Response took {elapsed}s"
        print(f"✓ Missing api_key returns 422: {response.json()}")
    
    def test_empty_file_returns_empty_text(self):
        """Empty file (0 bytes) returns {text: ''}"""
        files = {"file": ("empty.webm", io.BytesIO(b""), "audio/webm")}
        
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/transcribe",
            files=files,
            data={"api_key": DUMMY_API_KEY}
        )
        elapsed = time.time() - start
        
        assert response.status_code == 200, f"Expected 200, got {response.status_code}"
        data = response.json()
        assert "text" in data, "Missing 'text' field"
        assert data["text"] == "", f"Expected empty text, got '{data['text']}'"
        assert elapsed < 5, f"Response took {elapsed}s"
        print(f"✓ Empty file returns empty text: {data}")
    
    def test_invalid_api_key_returns_401_with_groq_error(self):
        """Invalid API key returns 401 with Groq error passthrough"""
        # Create a small valid-looking audio file
        audio_content = b"RIFF" + b"\x00" * 100  # Minimal RIFF header
        files = {"file": ("test.webm", io.BytesIO(audio_content), "audio/webm")}
        
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/transcribe",
            files=files,
            data={"api_key": DUMMY_API_KEY}
        )
        elapsed = time.time() - start
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Missing 'detail' field"
        assert "Invalid Groq API key" in data["detail"], f"Expected Groq error passthrough, got: {data['detail']}"
        assert elapsed < 5, f"Response took {elapsed}s"
        print(f"✓ Invalid API key returns 401 with Groq error: {data}")
    
    def test_oversized_file_returns_413(self):
        """File > 25MB returns 413"""
        # Create a file slightly over 25MB
        oversized_content = b"x" * (26 * 1024 * 1024)  # 26MB
        files = {"file": ("large.webm", io.BytesIO(oversized_content), "audio/webm")}
        
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/transcribe",
            files=files,
            data={"api_key": DUMMY_API_KEY}
        )
        elapsed = time.time() - start
        
        assert response.status_code == 413, f"Expected 413, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Missing 'detail' field"
        assert "25MB" in data["detail"], f"Expected size limit message, got: {data['detail']}"
        print(f"✓ Oversized file returns 413: {data}")


class TestSuggestionsEndpoint:
    """POST /api/suggestions - Live suggestions"""
    
    def test_missing_api_key_returns_400(self):
        """Missing api_key in body returns 400"""
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/suggestions",
            json={
                "transcript": "test transcript",
                "prompt": "test prompt",
                "context_window_chars": 6000,
                "previous_batches": []
            }
        )
        elapsed = time.time() - start
        
        # Pydantic validation error for missing required field
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        assert elapsed < 5, f"Response took {elapsed}s"
        print(f"✓ Missing api_key returns 422: {response.json()}")
    
    def test_empty_api_key_returns_400(self):
        """Empty api_key returns 400"""
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/suggestions",
            json={
                "api_key": "",
                "transcript": "test transcript",
                "prompt": "test prompt",
                "context_window_chars": 6000,
                "previous_batches": []
            }
        )
        elapsed = time.time() - start
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Missing 'detail' field"
        assert "api_key" in data["detail"].lower(), f"Expected api_key error, got: {data['detail']}"
        assert elapsed < 5, f"Response took {elapsed}s"
        print(f"✓ Empty api_key returns 400: {data}")
    
    def test_invalid_api_key_returns_401_with_groq_error(self):
        """Invalid API key returns 401 with Groq error passthrough"""
        start = time.time()
        response = requests.post(
            f"{BASE_URL}/api/suggestions",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "Hello, this is a test meeting.",
                "prompt": "Generate helpful suggestions",
                "context_window_chars": 6000,
                "previous_batches": []
            }
        )
        elapsed = time.time() - start
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "detail" in data, "Missing 'detail' field"
        assert "Invalid Groq API key" in data["detail"], f"Expected Groq error passthrough, got: {data['detail']}"
        print(f"✓ Invalid API key returns 401 with Groq error: {data}")
    
    def test_context_window_below_minimum_returns_422(self):
        """context_window_chars < 500 returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/suggestions",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 100,  # Below 500 minimum
                "previous_batches": []
            }
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"✓ context_window_chars < 500 returns 422: {response.json()}")
    
    def test_context_window_above_maximum_returns_422(self):
        """context_window_chars > 40000 returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/suggestions",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 50000,  # Above 40000 maximum
                "previous_batches": []
            }
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"✓ context_window_chars > 40000 returns 422: {response.json()}")
    
    def test_valid_context_window_bounds(self):
        """context_window_chars at boundaries (500, 40000) accepted"""
        # Test minimum bound
        response_min = requests.post(
            f"{BASE_URL}/api/suggestions",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 500,
                "previous_batches": []
            }
        )
        # Should get 401 (invalid key) not 422 (validation error)
        assert response_min.status_code == 401, f"Expected 401 at min bound, got {response_min.status_code}"
        
        # Test maximum bound
        response_max = requests.post(
            f"{BASE_URL}/api/suggestions",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 40000,
                "previous_batches": []
            }
        )
        assert response_max.status_code == 401, f"Expected 401 at max bound, got {response_max.status_code}"
        print("✓ context_window_chars bounds (500, 40000) accepted")


class TestExpandEndpoint:
    """POST /api/expand - Expand suggestion details"""
    
    def test_missing_api_key_returns_422(self):
        """Missing api_key returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/expand",
            json={
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 20000,
                "suggestion": {"type": "question", "title": "Test", "preview": "Test preview"}
            }
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"✓ Missing api_key returns 422: {response.json()}")
    
    def test_empty_api_key_returns_400(self):
        """Empty api_key returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/expand",
            json={
                "api_key": "",
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 20000,
                "suggestion": {"type": "question", "title": "Test", "preview": "Test preview"}
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "api_key" in data["detail"].lower(), f"Expected api_key error, got: {data['detail']}"
        print(f"✓ Empty api_key returns 400: {data}")
    
    def test_invalid_api_key_returns_401_with_groq_error(self):
        """Invalid API key returns 401 with Groq error passthrough"""
        response = requests.post(
            f"{BASE_URL}/api/expand",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "This is a test meeting transcript.",
                "prompt": "Expand on this suggestion",
                "context_window_chars": 20000,
                "suggestion": {"type": "question", "title": "Test Question", "preview": "What about X?"}
            }
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "Invalid Groq API key" in data["detail"], f"Expected Groq error passthrough, got: {data['detail']}"
        print(f"✓ Invalid API key returns 401 with Groq error: {data}")
    
    def test_context_window_below_minimum_returns_422(self):
        """context_window_chars < 500 returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/expand",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 100,  # Below 500
                "suggestion": {}
            }
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"✓ context_window_chars < 500 returns 422")
    
    def test_context_window_above_maximum_returns_422(self):
        """context_window_chars > 80000 returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/expand",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 100000,  # Above 80000
                "suggestion": {}
            }
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"✓ context_window_chars > 80000 returns 422")
    
    def test_valid_context_window_bounds(self):
        """context_window_chars at boundaries (500, 80000) accepted"""
        # Test minimum bound
        response_min = requests.post(
            f"{BASE_URL}/api/expand",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 500,
                "suggestion": {}
            }
        )
        assert response_min.status_code == 401, f"Expected 401 at min bound, got {response_min.status_code}"
        
        # Test maximum bound
        response_max = requests.post(
            f"{BASE_URL}/api/expand",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "context_window_chars": 80000,
                "suggestion": {}
            }
        )
        assert response_max.status_code == 401, f"Expected 401 at max bound, got {response_max.status_code}"
        print("✓ context_window_chars bounds (500, 80000) accepted")


class TestChatEndpoint:
    """POST /api/chat - Free-form chat"""
    
    def test_missing_api_key_returns_422(self):
        """Missing api_key returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "transcript": "test",
                "prompt": "test",
                "messages": [{"role": "user", "content": "Hello"}],
                "context_window_chars": 20000
            }
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"✓ Missing api_key returns 422: {response.json()}")
    
    def test_empty_api_key_returns_400(self):
        """Empty api_key returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "api_key": "",
                "transcript": "test",
                "prompt": "test",
                "messages": [{"role": "user", "content": "Hello"}],
                "context_window_chars": 20000
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "api_key" in data["detail"].lower(), f"Expected api_key error, got: {data['detail']}"
        print(f"✓ Empty api_key returns 400: {data}")
    
    def test_empty_messages_returns_400(self):
        """Empty messages array returns 400"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "messages": [],
                "context_window_chars": 20000
            }
        )
        
        assert response.status_code == 400, f"Expected 400, got {response.status_code}"
        data = response.json()
        assert "messages" in data["detail"].lower(), f"Expected messages error, got: {data['detail']}"
        print(f"✓ Empty messages returns 400: {data}")
    
    def test_invalid_api_key_returns_401_with_groq_error(self):
        """Invalid API key returns 401 with Groq error passthrough"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "This is a test meeting.",
                "prompt": "You are a helpful assistant",
                "messages": [{"role": "user", "content": "What was discussed?"}],
                "context_window_chars": 20000
            }
        )
        
        assert response.status_code == 401, f"Expected 401, got {response.status_code}"
        data = response.json()
        assert "Invalid Groq API key" in data["detail"], f"Expected Groq error passthrough, got: {data['detail']}"
        print(f"✓ Invalid API key returns 401 with Groq error: {data}")
    
    def test_context_window_below_minimum_returns_422(self):
        """context_window_chars < 500 returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "messages": [{"role": "user", "content": "Hi"}],
                "context_window_chars": 100  # Below 500
            }
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"✓ context_window_chars < 500 returns 422")
    
    def test_context_window_above_maximum_returns_422(self):
        """context_window_chars > 80000 returns 422"""
        response = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "messages": [{"role": "user", "content": "Hi"}],
                "context_window_chars": 100000  # Above 80000
            }
        )
        
        assert response.status_code == 422, f"Expected 422, got {response.status_code}"
        print(f"✓ context_window_chars > 80000 returns 422")
    
    def test_valid_context_window_bounds(self):
        """context_window_chars at boundaries (500, 80000) accepted"""
        # Test minimum bound
        response_min = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "messages": [{"role": "user", "content": "Hi"}],
                "context_window_chars": 500
            }
        )
        assert response_min.status_code == 401, f"Expected 401 at min bound, got {response_min.status_code}"
        
        # Test maximum bound
        response_max = requests.post(
            f"{BASE_URL}/api/chat",
            json={
                "api_key": DUMMY_API_KEY,
                "transcript": "test",
                "prompt": "test",
                "messages": [{"role": "user", "content": "Hi"}],
                "context_window_chars": 80000
            }
        )
        assert response_max.status_code == 401, f"Expected 401 at max bound, got {response_max.status_code}"
        print("✓ context_window_chars bounds (500, 80000) accepted")


class TestJSONResponses:
    """All endpoints return well-formed JSON (no 500 stacktraces)"""
    
    def test_all_error_responses_are_json(self):
        """Verify all error responses are valid JSON"""
        test_cases = [
            # Health endpoint
            ("GET", f"{BASE_URL}/api/", None, None),
            # Transcribe - missing file
            ("POST", f"{BASE_URL}/api/transcribe", {"api_key": DUMMY_API_KEY}, None),
            # Suggestions - empty api_key
            ("POST", f"{BASE_URL}/api/suggestions", None, {"api_key": "", "transcript": "", "prompt": "", "context_window_chars": 6000, "previous_batches": []}),
            # Expand - empty api_key
            ("POST", f"{BASE_URL}/api/expand", None, {"api_key": "", "transcript": "", "prompt": "", "context_window_chars": 20000, "suggestion": {}}),
            # Chat - empty messages
            ("POST", f"{BASE_URL}/api/chat", None, {"api_key": DUMMY_API_KEY, "transcript": "", "prompt": "", "messages": [], "context_window_chars": 20000}),
        ]
        
        for method, url, data, json_body in test_cases:
            if method == "GET":
                response = requests.get(url)
            else:
                if json_body:
                    response = requests.post(url, json=json_body)
                else:
                    response = requests.post(url, data=data)
            
            # Verify response is valid JSON
            try:
                response.json()
                print(f"✓ {method} {url.split('/api/')[-1]} returns valid JSON (status: {response.status_code})")
            except Exception as e:
                pytest.fail(f"✗ {method} {url} returned invalid JSON: {response.text[:200]}")
    
    def test_no_500_errors_on_bad_input(self):
        """Bad input should not cause 500 errors"""
        bad_inputs = [
            # Malformed JSON
            ("POST", f"{BASE_URL}/api/suggestions", "not json", {"Content-Type": "application/json"}),
            # Wrong content type
            ("POST", f"{BASE_URL}/api/chat", '{"api_key": "test"}', {"Content-Type": "text/plain"}),
        ]
        
        for method, url, data, headers in bad_inputs:
            response = requests.post(url, data=data, headers=headers)
            assert response.status_code != 500, f"Got 500 error on {url}: {response.text[:200]}"
            print(f"✓ {url.split('/api/')[-1]} handles bad input gracefully (status: {response.status_code})")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
