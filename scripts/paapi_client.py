import os
import json
import time
import random
import hmac
import hashlib
import datetime
import requests
from typing import Dict, Any, Optional

class PAAPIClient:
    """
    Client for Amazon Product Advertising API (PA-API) v5.
    Handles authentication and robust retry logic with jitter.
    """

    def __init__(self, access_key: Optional[str] = None, secret_key: Optional[str] = None, partner_tag: Optional[str] = None, region: str = 'us-west-2', host: str = 'webservices.amazon.co.jp'):
        # Try to load .env manually if it exists
        env_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), '.env')
        if os.path.exists(env_path):
            with open(env_path, 'r', encoding='utf-8') as f:
                for line in f:
                    line = line.strip()
                    if line and not line.startswith('#') and '=' in line:
                        key, value = line.split('=', 1)
                        if key not in os.environ:
                            os.environ[key] = value

        self.access_key = access_key or os.environ.get("AMAZON_ACCESS_KEY")
        self.secret_key = secret_key or os.environ.get("AMAZON_SECRET_KEY")
        self.partner_tag = partner_tag or os.environ.get("AMAZON_PARTNER_TAG")
        self.region = region
        self.host = host
        self.service = 'ProductAdvertisingAPI'

        if not self.access_key or not self.secret_key or not self.partner_tag:
            raise ValueError("Missing PA-API credentials. Please set AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, and AMAZON_PARTNER_TAG environment variables.")

    def _sign(self, key, msg):
        return hmac.new(key, msg.encode('utf-8'), hashlib.sha256).digest()

    def _get_signature_key(self, key, date_stamp, region_name, service_name):
        k_date = self._sign(('AWS4' + key).encode('utf-8'), date_stamp)
        k_region = self._sign(k_date, region_name)
        k_service = self._sign(k_region, service_name)
        k_signing = self._sign(k_service, 'aws4_request')
        return k_signing

    def _get_signed_headers(self, payload: str, operation: str) -> Dict[str, str]:
        method = 'POST'
        endpoint_path = f'/paapi5/{operation.lower()}'
        
        t = datetime.datetime.utcnow()
        amz_date = t.strftime('%Y%m%dT%H%M%SZ')
        date_stamp = t.strftime('%Y%m%d')

        canonical_uri = endpoint_path
        canonical_querystring = ''
        target = f'com.amazon.paapi5.v1.ProductAdvertisingAPIv1.{operation}'
        
        canonical_headers = f'host:{self.host}\nx-amz-date:{amz_date}\nx-amz-target:{target}\n'
        signed_headers = 'host;x-amz-date;x-amz-target'
        payload_hash = hashlib.sha256(payload.encode('utf-8')).hexdigest()

        canonical_request = f"{method}\n{canonical_uri}\n{canonical_querystring}\n{canonical_headers}\n{signed_headers}\n{payload_hash}"
        
        algorithm = 'AWS4-HMAC-SHA256'
        credential_scope = f"{date_stamp}/{self.region}/{self.service}/aws4_request"
        string_to_sign = f"{algorithm}\n{amz_date}\n{credential_scope}\n{hashlib.sha256(canonical_request.encode('utf-8')).hexdigest()}"

        signing_key = self._get_signature_key(self.secret_key, date_stamp, self.region, self.service)
        signature = hmac.new(signing_key, string_to_sign.encode('utf-8'), hashlib.sha256).hexdigest()

        authorization_header = f"{algorithm} Credential={self.access_key}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}"
        
        headers = {
            'host': self.host,
            'x-amz-date': amz_date,
            'x-amz-target': target,
            'content-type': 'application/json; charset=utf-8',
            'authorization': authorization_header,
            'content-encoding': 'amz-1.0'
        }
        return headers

    def request(self, operation: str, payload_dict: Dict[str, Any]) -> Dict[str, Any]:
        """
        Make a request to PA-API with retry logic.
        
        Args:
            operation: API operation name (e.g., 'GetItems', 'SearchItems')
            payload_dict: Dictionary containing the request payload (excluding common fields like PartnerTag if not provided)

        Returns:
            JSON response as specific dictionary
        """
        # Add common fields if not present
        if "PartnerTag" not in payload_dict:
            payload_dict["PartnerTag"] = self.partner_tag
        if "PartnerType" not in payload_dict:
            payload_dict["PartnerType"] = "Associates"

        payload = json.dumps(payload_dict)
        endpoint = f'https://{self.host}/paapi5/{operation.lower()}'
        
        max_retries = 5
        base_retry_delay = 1.0 # seconds
        
        last_error = None
        
        for attempt in range(1, max_retries + 1):
            try:
                # Generate new headers for each attempt (timestamp updates)
                headers = self._get_signed_headers(payload, operation)
                
                response = requests.post(endpoint, data=payload, headers=headers, timeout=30)
                
                # Check for HTTP errors
                response.raise_for_status()
                
                response_json = response.json()
                
                # Check for API-level errors in response body
                if 'Errors' in response_json and response_json['Errors']:
                    error = response_json['Errors'][0]
                    error_code = error.get('Code', 'Unknown')
                    error_message = error.get('Message', 'Unknown error')
                    raise Exception(f"PA-API Error: {error_code} - {error_message}")
                
                return response_json
            
            except Exception as e:
                last_error = e
                error_str = str(e)
                
                # Identify non-retryable errors
                non_retryable_errors = ['InvalidParameterValue', 'ItemNotAccessible', 'IncompleteCredentials']
                if any(err in error_str for err in non_retryable_errors):
                    print(f"Non-retryable error detected: {error_str}")
                    raise last_error

                if attempt < max_retries:
                    # Calculate delay with jitter
                    is_429 = '429' in error_str or 'TooManyRequests' in error_str
                    current_base_delay = 5.0 if is_429 else base_retry_delay
                    
                    # Exponential backoff
                    delay = current_base_delay * (2 ** (attempt - 1))
                    
                    # Apply random jitter: +/- 50% of the calculated delay
                    # This ensures concurrent agents don't retry at the exact same time
                    jitter_factor = random.uniform(0.5, 1.5)
                    final_delay = delay * jitter_factor
                    
                    print(f"Request failed (attempt {attempt}/{max_retries}), retrying in {final_delay:.2f}s: {error_str}")
                    time.sleep(final_delay)
                else:
                    print(f"Retries exhausted after {max_retries} attempts.")
        
        raise last_error or Exception("Unknown error occurred")
