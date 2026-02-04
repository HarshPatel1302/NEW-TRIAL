// Database Manager - Uses localStorage for visitor tracking

class DatabaseManager {
    constructor() {
        this.storageKey = 'greenscape_visitors';
        this.init();
    }

    /**
     * Initialize database
     */
    init() {
        if (!localStorage.getItem(this.storageKey)) {
            localStorage.setItem(this.storageKey, JSON.stringify([]));
            Utils.log('Database initialized');
        }
    }

    /**
     * Get all visitors
     */
    getAllVisitors() {
        try {
            const data = localStorage.getItem(this.storageKey);
            return JSON.parse(data) || [];
        } catch (error) {
            Utils.log('Error reading database: ' + error.message, 'error');
            return [];
        }
    }

    /**
     * Save visitor
     */
    saveVisitor(visitorData) {
        try {
            const visitors = this.getAllVisitors();
            const newVisitor = {
                id: Utils.generateVisitorId(),
                name: visitorData.name,
                phone: visitorData.phone,
                meetingWith: visitorData.meetingWith,
                photo: visitorData.photo || null,
                timestamp: new Date().toISOString(),
                visitCount: 1
            };

            visitors.push(newVisitor);
            localStorage.setItem(this.storageKey, JSON.stringify(visitors));
            Utils.log(`Visitor saved: ${newVisitor.name}`, 'success');

            return newVisitor;
        } catch (error) {
            Utils.log('Error saving visitor: ' + error.message, 'error');
            return null;
        }
    }

    /**
     * Find visitor by phone number
     */
    findByPhone(phone) {
        const visitors = this.getAllVisitors();
        const cleaned = phone.replace(/\D/g, '');

        return visitors.find(v => {
            const vPhone = v.phone.replace(/\D/g, '');
            return vPhone === cleaned;
        });
    }

    /**
     * Find visitor by photo (face matching simulation)
     * In production, this would use actual face recognition
     */
    findByPhoto(photoData) {
        const visitors = this.getAllVisitors();

        // For prototype, we'll just check if photo exists
        // In production, integrate with face recognition API
        return visitors.find(v => v.photo && v.photo === photoData);
    }

    /**
     * Update visitor visit count
     */
    updateVisitCount(visitorId) {
        try {
            const visitors = this.getAllVisitors();
            const index = visitors.findIndex(v => v.id === visitorId);

            if (index !== -1) {
                visitors[index].visitCount = (visitors[index].visitCount || 1) + 1;
                visitors[index].lastVisit = new Date().toISOString();
                localStorage.setItem(this.storageKey, JSON.stringify(visitors));
                Utils.log(`Visit count updated for ${visitors[index].name}`, 'success');
                return visitors[index];
            }

            return null;
        } catch (error) {
            Utils.log('Error updating visit count: ' + error.message, 'error');
            return null;
        }
    }

    /**
     * Get visitor history (recent visits)
     */
    getRecentVisits(limit = 10) {
        const visitors = this.getAllVisitors();
        return visitors
            .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
            .slice(0, limit);
    }

    /**
     * Search visitors by name
     */
    searchByName(name) {
        const visitors = this.getAllVisitors();
        const normalized = Utils.normalizeName(name);

        return visitors.filter(v =>
            Utils.normalizeName(v.name).includes(normalized)
        );
    }

    /**
     * Clear all visitor data
     */
    clearAll() {
        if (confirm('Are you sure you want to clear all visitor data?')) {
            localStorage.setItem(this.storageKey, JSON.stringify([]));
            Utils.log('Database cleared', 'warning');
            return true;
        }
        return false;
    }

    /**
     * Export data as JSON
     */
    exportData() {
        const visitors = this.getAllVisitors();
        const dataStr = JSON.stringify(visitors, null, 2);
        const dataBlob = new Blob([dataStr], { type: 'application/json' });

        const url = URL.createObjectURL(dataBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `greenscape_visitors_${new Date().toISOString().split('T')[0]}.json`;
        link.click();

        URL.revokeObjectURL(url);
        Utils.log('Data exported', 'success');
    }

    /**
     * Get statistics
     */
    getStats() {
        const visitors = this.getAllVisitors();

        return {
            totalVisitors: visitors.length,
            uniqueVisitors: new Set(visitors.map(v => v.phone)).size,
            totalVisits: visitors.reduce((sum, v) => sum + (v.visitCount || 1), 0),
            withPhotos: visitors.filter(v => v.photo).length,
            recentVisits: visitors.filter(v => {
                const visitDate = new Date(v.timestamp);
                const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
                return visitDate > dayAgo;
            }).length
        };
    }
}

// Create global database instance
const DB = new DatabaseManager();

// Debug commands (accessible from console)
window.dbDebug = {
    getAll: () => DB.getAllVisitors(),
    stats: () => DB.getStats(),
    clear: () => DB.clearAll(),
    export: () => DB.exportData(),
    find: (phone) => DB.findByPhone(phone)
};
