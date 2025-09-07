const fetch = require('node-fetch');

/**
 * API client for the Veyra verification system
 */
class VeyraAPI {
  constructor(baseUrl, username, password) {
    this.baseUrl = baseUrl;
    this.username = username;
    this.password = password;
    this.token = null;
  }

  /**
   * Authenticate with the Veyra API
   * @returns {Promise<Object>} Authentication response
   */
  async login() {
    try {
      const response = await fetch(`${this.baseUrl}/api/auth/login`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          username: this.username,
          password: this.password
        })
      });

      if (!response.ok) {
        throw new Error(`Login failed: ${response.status}`);
      }

      const data = await response.json();
      this.token = data.token;
      console.log('Successfully logged into Veyra API');
      return data;
    } catch (error) {
      console.error('Failed to login to Veyra API:', error.message);
      throw error;
    }
  }

  /**
   * Make an authenticated request with automatic token refresh
   * @param {string} url - The URL to request
   * @param {Object} options - Fetch options
   * @returns {Promise<Response>} The response
   */
  async authenticatedRequest(url, options = {}) {
    // Ensure we have a token
    if (!this.token) {
      await this.login();
    }

    // Add authorization header
    const requestOptions = {
      ...options,
      headers: {
        ...options.headers,
        'Authorization': `Bearer ${this.token}`
      }
    };

    let response = await fetch(url, requestOptions);

    // Check if token expired (401 Unauthorized or 403 Forbidden)
    if (response.status === 401 || response.status === 403) {
      console.log('Token expired, refreshing...');
      await this.login(); // Refresh the token
      
      // Retry the request with the new token
      requestOptions.headers['Authorization'] = `Bearer ${this.token}`;
      response = await fetch(url, requestOptions);
    }

    return response;
  }

  /**
   * Get verification data by ckey
   * @param {string} ckey - The BYOND ckey to lookup
   * @returns {Promise<Object|null>} Verification data or null if not found
   */
  async getVerificationByCkey(ckey) {
    try {
      const response = await this.authenticatedRequest(`${this.baseUrl}/api/v1/verify/ckey/${ckey}`);
      
      if (response.status === 404) {
        return null;
      }
      
      if (!response.ok) {
        throw new Error(`Failed to fetch verification: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error fetching verification:', error);
      throw error;
    }
  }

  /**
   * Create or update a verification record
   * @param {string} discordId - Discord user ID
   * @param {string} ckey - BYOND ckey
   * @param {Object} verifiedFlags - Verification flags object
   * @returns {Promise<Object>} API response
   */
  async createOrUpdateVerification(discordId, ckey, verifiedFlags = {}) {
    try {
      const response = await this.authenticatedRequest(`${this.baseUrl}/api/v1/verify`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          discord_id: discordId,
          ckey: ckey,
          verified_flags: verifiedFlags,
          verification_method: 'manual_discord'
        })
      });
      
      if (!response.ok) {
        throw new Error(`Failed to create/update verification: ${response.status}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Error creating/updating verification:', error);
      throw error;
    }
  }
}

module.exports = VeyraAPI;