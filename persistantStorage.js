const fs = require('fs').promises;
const path = require('path');

/**
 * Generic persistent storage class for bot data
 */
class PersistentStorage {
  constructor(filePath, dataName = 'data') {
    this.filePath = filePath;
    this.dataName = dataName;
    this.data = new Map();
    this.initialized = false;
  }

  async init() {
    if (this.initialized) return;
    
    try {
      await this.loadData();
      this.initialized = true;
      console.log(`${this.dataName} storage initialized with ${this.data.size} entries`);
    } catch (error) {
      console.error(`Error initializing ${this.dataName} storage:`, error);
      throw error;
    }
  }

  async loadData() {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      
      const data = await fs.readFile(this.filePath, 'utf8');
      const parsed = JSON.parse(data);
      
      // Convert back to Map with proper Date objects
      Object.entries(parsed).forEach(([key, value]) => {
        // Convert date strings back to Date objects
        if (value.createdAt) value.createdAt = new Date(value.createdAt);
        if (value.updatedAt) value.updatedAt = new Date(value.updatedAt);
        this.data.set(key, value);
      });
      
    } catch (error) {
      if (error.code === 'ENOENT') {
        console.log(`No existing ${this.dataName} data found, starting fresh`);
        // Create empty file
        await this.saveData();
      } else {
        console.error(`Error loading ${this.dataName} data:`, error);
        throw error;
      }
    }
  }

  async saveData() {
    try {
      // Ensure directory exists
      await fs.mkdir(path.dirname(this.filePath), { recursive: true });
      
      // Convert Map to plain object for JSON storage
      const dataToSave = Object.fromEntries(this.data);
      await fs.writeFile(this.filePath, JSON.stringify(dataToSave, null, 2));
      
    } catch (error) {
      console.error(`Error saving ${this.dataName} data:`, error);
      throw error;
    }
  }

  // Basic CRUD operations
  async set(key, value) {
    if (!this.initialized) await this.init();
    
    value.updatedAt = new Date();
    this.data.set(key, value);
    await this.saveData();
  }

  async get(key) {
    if (!this.initialized) await this.init();
    return this.data.get(key);
  }

  async delete(key) {
    if (!this.initialized) await this.init();
    
    const deleted = this.data.delete(key);
    if (deleted) {
      await this.saveData();
    }
    return deleted;
  }

  async has(key) {
    if (!this.initialized) await this.init();
    return this.data.has(key);
  }

  async values() {
    if (!this.initialized) await this.init();
    return Array.from(this.data.values());
  }

  async entries() {
    if (!this.initialized) await this.init();
    return Array.from(this.data.entries());
  }

  async keys() {
    if (!this.initialized) await this.init();
    return Array.from(this.data.keys());
  }

  async size() {
    if (!this.initialized) await this.init();
    return this.data.size;
  }

  // Find operations
  async find(predicate) {
    if (!this.initialized) await this.init();
    return Array.from(this.data.values()).find(predicate);
  }

  async filter(predicate) {
    if (!this.initialized) await this.init();
    return Array.from(this.data.values()).filter(predicate);
  }
}

/**
 * Specialized storage for vetting data
 */
class VettingStorage extends PersistentStorage {
  constructor() {
    super('./data/vettings.json', 'vetting');
  }

  async getByUserId(userId) {
    return this.find(v => v.userId === userId && v.status === 'pending');
  }

  async getPendingVettings() {
    return this.filter(v => v.status === 'pending');
  }

  async updateStatus(vettingId, status, adminId = null) {
    const vetting = await this.get(vettingId);
    if (vetting) {
      vetting.status = status;
      vetting.processedBy = adminId;
      vetting.processedAt = new Date();
      await this.set(vettingId, vetting);
    }
    return vetting;
  }

  async cleanup() {
    const oneMonthAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const entries = await this.entries();
    let cleaned = 0;

    for (const [id, vetting] of entries) {
      if ((vetting.status === 'approved' || vetting.status === 'denied') && 
          vetting.createdAt < oneMonthAgo) {
        await this.delete(id);
        cleaned++;
      }
    }

    console.log(`Cleaned up ${cleaned} old vetting records`);
    return cleaned;
  }
}

/**
 * Specialized storage for commission data
 */
class CommissionStorage extends PersistentStorage {
  constructor() {
    super('./data/commissions.json', 'commission');
  }

  async getByChannelId(channelId) {
    return this.find(c => c.channelId === channelId);
  }

  async getByCreatorId(creatorId) {
    return this.find(c => c.creatorId === creatorId && c.status === 'active');
  }

  async isCreator(channelId, userId) {
    const commission = await this.getByChannelId(channelId);
    return commission && commission.creatorId === userId;
  }

  async addRep(channelId, userId) {
    const commission = await this.getByChannelId(channelId);
    if (commission && !commission.reps.includes(userId)) {
      commission.reps.push(userId);
      await this.set(commission.id, commission);
      return true;
    }
    return false;
  }

  async removeRep(channelId, userId) {
    const commission = await this.getByChannelId(channelId);
    if (commission) {
      const index = commission.reps.indexOf(userId);
      if (index > -1) {
        commission.reps.splice(index, 1);
        await this.set(commission.id, commission);
        return true;
      }
    }
    return false;
  }

  async updateChannelName(channelId, newName) {
    const commission = await this.getByChannelId(channelId);
    if (commission) {
      commission.channelName = newName;
      await this.set(commission.id, commission);
      return commission;
    }
    return null;
  }

  async setStatus(channelId, status) {
    const commission = await this.getByChannelId(channelId);
    if (commission) {
      commission.status = status;
      await this.set(commission.id, commission);
      return commission;
    }
    return null;
  }

  async cleanup() {
    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const entries = await this.entries();
    let cleaned = 0;

    for (const [id, commission] of entries) {
      if (commission.status === 'inactive' && commission.createdAt < oneWeekAgo) {
        await this.delete(id);
        cleaned++;
      }
    }

    console.log(`Cleaned up ${cleaned} old commission records`);
    return cleaned;
  }
}

// Export singleton instances
const vettingStorage = new VettingStorage();
const commissionStorage = new CommissionStorage();

// Initialize storage on module load
Promise.all([
  vettingStorage.init(),
  commissionStorage.init()
]).then(() => {
  console.log('All storage systems initialized successfully');
}).catch(error => {
  console.error('Failed to initialize storage systems:', error);
});

module.exports = {
  PersistentStorage,
  VettingStorage,
  CommissionStorage,
  vettingStorage,
  commissionStorage
};