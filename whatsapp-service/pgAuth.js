const { initAuthCreds, BufferJSON, proto } = require('@whiskeysockets/baileys');

module.exports = async (pool) => {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS whatsapp_auth_keys (
            id VARCHAR(255) PRIMARY KEY,
            data JSONB
        );
    `);

    const writeData = async (data, id) => {
        try {
            await pool.query(
                `INSERT INTO whatsapp_auth_keys (id, data) VALUES ($1, $2) ON CONFLICT (id) DO UPDATE SET data = $2`,
                [id, JSON.stringify(data, BufferJSON.replacer)]
            );
        } catch (error) {
            console.error(`Error writing auth data for ${id}:`, error);
        }
    };

    const readData = async (id) => {
        try {
            const res = await pool.query(`SELECT data FROM whatsapp_auth_keys WHERE id = $1`, [id]);
            if (res.rows.length > 0) {
                return JSON.parse(JSON.stringify(res.rows[0].data), BufferJSON.reviver);
            }
            return null;
        } catch (error) {
            console.error(`Error reading auth data for ${id}:`, error);
            return null;
        }
    };

    const removeData = async (id) => {
        try {
            await pool.query(`DELETE FROM whatsapp_auth_keys WHERE id = $1`, [id]);
        } catch (error) {
            console.error(`Error removing auth data for ${id}:`, error);
        }
    };

    let creds = await readData('creds');
    if (!creds) {
        creds = initAuthCreds();
        await writeData(creds, 'creds');
    }

    return {
        state: {
            creds,
            keys: {
                get: async (type, ids) => {
                    const data = {};
                    await Promise.all(
                        ids.map(async (id) => {
                            let value = await readData(`${type}-${id}`);
                            if (type === 'app-state-sync-key' && value) {
                                value = proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            data[id] = value;
                        })
                    );
                    return data;
                },
                set: async (data) => {
                    const tasks = [];
                    for (const category in data) {
                        for (const id in data[category]) {
                            const value = data[category][id];
                            const key = `${category}-${id}`;
                            if (value) {
                                tasks.push(writeData(value, key));
                            } else {
                                tasks.push(removeData(key));
                            }
                        }
                    }
                    await Promise.all(tasks);
                }
            }
        },
        saveCreds: () => writeData(creds, 'creds')
    };
};
