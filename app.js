/**
 * Wallpaper Sync
 * Sync wallpapers across multiple Linux/GNOME computers using Dropbox
 * 
 * This application monitors wallpaper changes on GNOME desktop and syncs them
 * across all computers by storing wallpapers in a Dropbox folder.
 */

import os from 'os'
import fs from 'fs'
import path from 'path'
import winston from 'winston'
import chokidar from 'chokidar'
import { spawn } from 'child_process'

const HOME_DIR = os.homedir()
const GNOME_CONFIG_DIR = path.join(HOME_DIR, '.config')
const GNOME_BACKGROUND_FILE = path.join(GNOME_CONFIG_DIR, 'background')
const DROPBOX_WALLPAPER_DIR = path.join(HOME_DIR, 'Dropbox', 'Photos', 'wallpaper')
const APP_CONFIG_DIR = path.join(HOME_DIR, '.config', 'wallpaper-sync')
const APP_LOG_DIR = path.join(HOME_DIR, '.local', 'state', 'wallpaper-sync')
const CONFIG_FILE = path.join(APP_CONFIG_DIR, 'config.json')
const LOG_FILE = path.join(APP_LOG_DIR, 'debug.log')

const DEBOUNCE_DELAY = 2000

let logger
let debounceTimeouts = new Map()

/**
 * Initialize winston logger
 */
const initializeLogger = () => {
    logger = winston.createLogger({
        level: 'info',
        format: winston.format.combine(
            winston.format.timestamp({
                format: 'YYYY-MM-DD HH:mm:ss'
            }),
            winston.format.printf(({ timestamp, message }) => {
                return `${timestamp} ${message}`
            })
        ),
        transports: [
            new winston.transports.Console({
                format: winston.format.combine(
                    winston.format.colorize(),
                    winston.format.printf(({ timestamp, message }) => {
                        return `${timestamp} ${message}`
                    })
                )
            }),
            new winston.transports.File({
                filename: LOG_FILE,
                maxsize: 1024 * 1024, // 1MB max file size
                maxFiles: 1,
                tailable: true
            })
        ]
    })
    
    // Handle logger errors
    logger.on('error', (error) => {
        console.error('Logger error:', error)
    })
}

/**
 * Create necessary directories
 */
const createDirectories = async () => {
    const directories = [APP_CONFIG_DIR, APP_LOG_DIR, DROPBOX_WALLPAPER_DIR]
    
    for (const dir of directories) {
        try {
            await fs.promises.mkdir(dir, { recursive: true })
        } catch (error) {
            throw new Error(`Failed to create directory ${dir}: ${error.message}`)
        }
    }
}

/**
 * Initialize configuration file
 */
const initializeConfig = async () => {
    try {
        await fs.promises.access(CONFIG_FILE)

        // Config file exists, validate it
        const configData = await fs.promises.readFile(CONFIG_FILE, 'utf8')
        const config = JSON.parse(configData)
        
        if (!config.handledWallpapers || !Array.isArray(config.handledWallpapers)) {
            throw new Error('Invalid config file format')
        }
        
        logger.info(`[info] Loaded config with ${config.handledWallpapers.length} handled wallpapers`)
    } catch (error) {
        if (error.code === 'ENOENT') {
            const initialConfig = { handledWallpapers: [] }
            await fs.promises.writeFile(CONFIG_FILE, JSON.stringify(initialConfig, null, 2))

            logger.info('[info] Created new config file')
        } else {
            throw new Error(`Failed to initialize config: ${error.message}`)
        }
    }
}

/**
 * Read configuration from file
 */
const readConfig = async () => {
    try {
        const configData = await fs.promises.readFile(CONFIG_FILE, 'utf8')

        return JSON.parse(configData)
    } catch (error) {
        logger.error(`[error] Failed to read config: ${error.message}`)

        return {
            handledWallpapers: []
        }
    }
}

/**
 * Write configuration to file
 */
const writeConfig = async (config) => {
    try {
        await fs.promises.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2))
    } catch (error) {
        logger.error(`[error] Failed to write config: ${error.message}`)

        throw error
    }
}

/**
 * Check if a wallpaper has been handled
 */
const isWallpaperHandled = async (wallpaperName) => {
    const config = await readConfig()

    return config.handledWallpapers.includes(wallpaperName)
}

/**
 * Mark a wallpaper as handled
 */
const markWallpaperAsHandled = async (wallpaperName) => {
    logger.info(`[info] Marking wallpaper as handled: ${wallpaperName}`)

    try {
        const config = await readConfig()

        if (!config.handledWallpapers.includes(wallpaperName)) {
            config.handledWallpapers.push(wallpaperName)
            await writeConfig(config)

            logger.info(`[info] Marked wallpaper as handled: ${wallpaperName}`)
        }
    } catch (error) {
        logger.error(`[error] Failed to mark wallpaper as handled: ${error.message}`)

        throw error
    }
}

/**
 * Generate datetime string for wallpaper filename
 */
const generateDateTimeString = () => {
    const now = new Date()
    const year = now.getFullYear()
    const month = String(now.getMonth() + 1).padStart(2, '0')
    const day = String(now.getDate()).padStart(2, '0')
    const hours = String(now.getHours()).padStart(2, '0')
    const minutes = String(now.getMinutes()).padStart(2, '0')
    const seconds = String(now.getSeconds()).padStart(2, '0')
    
    return `${year}-${month}-${day}T${hours}-${minutes}-${seconds}`
}

/**
 * Parse datetime from wallpaper filename
 */
const parseDateTimeFromFilename = (filename) => {
    const match = filename.match(/wallpaper-(\d{4})-(\d{2})-(\d{2})T(\d{2})-(\d{2})-(\d{2})$/)

    if (!match) {
        return null
    }

    const [_, year, month, day, hour, minute, second] = match

    const date = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second)
    )

    if (isNaN(date.getTime())) {
        return null
    }

    return date
}

/**
 * Debounce function calls
 */
const debounce = (key, fn, delay) => {
    if (debounceTimeouts.has(key)) {
        clearTimeout(debounceTimeouts.get(key))
    }
    
    const timeout = setTimeout(() => {
        debounceTimeouts.delete(key)
        fn()
    }, delay)
    
    debounceTimeouts.set(key, timeout)
}

/**
 * Copy file with error handling and retries
 */
const copyFileWithRetry = async (source, destination, maxRetries = 3) => {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            await fs.promises.copyFile(source, destination)
            
            return true
        } catch (error) {
            logger.warn(`[warn] Copy attempt ${attempt} failed: ${error.message}`)

            if (attempt === maxRetries) {
                throw error
            }

            // Wait before retry
            await new Promise(resolve => setTimeout(resolve, 1000 * attempt))
        }
    }
    return false
}

/**
 * Handle GNOME wallpaper change
 */
const handleWallpaperChange = async () => {
    try {
        logger.info('[info] Detected wallpaper change, processing...')
        
        // Check if background file exists
        try {
            await fs.promises.access(GNOME_BACKGROUND_FILE)
        } catch {
            logger.warn('[warn] Background file does not exist, skipping')
            return
        }
        
        // Generate wallpaper filename with current datetime
        const dateTimeString = generateDateTimeString()
        const wallpaperName = `wallpaper-${dateTimeString}`
        const destinationPath = path.join(DROPBOX_WALLPAPER_DIR, wallpaperName)
        
        // Mark as handled BEFORE copying to avoid loop
        await markWallpaperAsHandled(wallpaperName)
        
        // Copy wallpaper to Dropbox
        await copyFileWithRetry(GNOME_BACKGROUND_FILE, destinationPath)
        
        logger.info(`[info] Successfully copied wallpaper to Dropbox: ${wallpaperName}`)
    } catch (error) {
        logger.error(`[error] Failed to handle wallpaper change: ${error.message}`)
    }
}

/**
 * Start GNOME wallpaper watcher
 */
const startGnomeWatcher = () => {
    logger.info('[info] Starting GNOME wallpaper watcher')
    
    const watcher = chokidar.watch(GNOME_CONFIG_DIR, {
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: {
            stabilityThreshold: 1000,
            pollInterval: 100
        }
    })
    
    watcher.on('add', (filePath) => {
        if (path.basename(filePath) === 'background') {
            logger.info('[info] New background file detected')
            debounce('gnome-wallpaper', handleWallpaperChange, DEBOUNCE_DELAY)
        }
    })
    
    watcher.on('change', (filePath) => {
        if (path.basename(filePath) === 'background') {
            logger.info('[info] Background file changed')
            debounce('gnome-wallpaper', handleWallpaperChange, DEBOUNCE_DELAY)
        }
    })
    
    watcher.on('error', (error) => {
        logger.error(`[error] GNOME watcher error: ${error.message}`)
    })
    
    return watcher
}

/**
 * Execute gsettings command to set wallpaper
 */
const setGnomeWallpaper = async (wallpaperPath) => {
    logger.info(`[info] Changing wallpaper to: ${wallpaperPath}`)

    return new Promise((resolve, reject) => {
        const fileUri = `file://${wallpaperPath}`
        
        // Set both light and dark wallpapers
        const commands = [
            ['gsettings', 'set', 'org.gnome.desktop.background', 'picture-uri', fileUri],
            ['gsettings', 'set', 'org.gnome.desktop.background', 'picture-uri-dark', fileUri]
        ]
        
        let completed = 0
        let hasError = false
        
        commands.forEach(command => {
            const process = spawn(command[0], command.slice(1))
            
            process.on('error', (error) => {
                if (!hasError) {
                    hasError = true
                    reject(new Error(`Failed to execute ${command.join(' ')}: ${error.message}`))
                }
            })
            
            process.on('close', (code) => {
                if (code !== 0 && !hasError) {
                    hasError = true
                    reject(new Error(`Command ${command.join(' ')} exited with code ${code}`))
                    return
                }
                
                completed++

                if (completed === commands.length && !hasError) {
                    resolve()
                }
            })
        })
    })
}

/**
 * Get newest wallpaper from Dropbox directory
 */
const getNewestWallpaper = async () => {
    try {
        const files = await fs.promises.readdir(DROPBOX_WALLPAPER_DIR)

        const wallpaperFiles = files
            .filter(file => /^wallpaper-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(file))
            .map(file => ({
                name: file,
                path: path.join(DROPBOX_WALLPAPER_DIR, file),
                date: parseDateTimeFromFilename(file)
            }))
            .filter(file => file.date !== null)
            .sort((a, b) => b.date - a.date)

        logger.info(`[info] Wallpaper files sorted by date: ${JSON.stringify(wallpaperFiles)}`)
        
        return wallpaperFiles.length > 0 ? wallpaperFiles[0] : null
    } catch (error) {
        logger.error(`[error] Failed to read Dropbox wallpaper directory: ${error.message}`)

        return null
    }
}

/**
 * Handle Dropbox wallpaper change
 */
const handleDropboxWallpaperChange = async () => {
    try {
        logger.info('[info] Checking for new wallpapers in Dropbox...')
        
        const newestWallpaper = await getNewestWallpaper()

        if (!newestWallpaper) {
            logger.info('[info] No wallpapers found in Dropbox')

            return
        }
        
        logger.info(`[info] Newest wallpaper: ${newestWallpaper.name}`)
        
        // Check if already handled
        if (await isWallpaperHandled(newestWallpaper.name)) {
            logger.info('[info] Wallpaper already handled, skipping')

            return
        }
        
        // Verify file exists
        try {
            await fs.promises.access(newestWallpaper.path)
        } catch {
            logger.warn(`[warn] Wallpaper file does not exist: ${newestWallpaper.path}`)

            return
        }
        
        // Set as GNOME wallpaper
        await setGnomeWallpaper(newestWallpaper.path)
        
        // Mark as handled
        await markWallpaperAsHandled(newestWallpaper.name)
        
        logger.info(`[info] Successfully set new wallpaper: ${newestWallpaper.name}`)
    } catch (error) {
        logger.error(`[error] Failed to handle Dropbox wallpaper change: ${error.message}`)
    }
}

/**
 * Start Dropbox wallpaper watcher
 */
const startDropboxWatcher = () => {
    logger.info('[info] Starting Dropbox wallpaper watcher')
    
    const watcher = chokidar.watch(DROPBOX_WALLPAPER_DIR, {
        ignoreInitial: true,
        atomic: true,
        awaitWriteFinish: {
            stabilityThreshold: 2000,
            pollInterval: 100
        }
    })
    
    watcher.on('add', (filePath) => {
        logger.info(`[info] Chokidar Dropbox watcher! New file: ${filePath}`)

        const filename = path.basename(filePath)

        if (/^wallpaper-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(filename)) {
            logger.info(`[info] New wallpaper detected in Dropbox: ${filename}`)
            debounce('dropbox-wallpaper', handleDropboxWallpaperChange, DEBOUNCE_DELAY)
        }
    })
    
    watcher.on('change', (filePath) => {
        const filename = path.basename(filePath)

        if (/^wallpaper-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(filename)) {
            logger.info(`[info] Wallpaper changed in Dropbox: ${filename}`)
            debounce('dropbox-wallpaper', handleDropboxWallpaperChange, DEBOUNCE_DELAY)
        }
    })
    
    watcher.on('error', (error) => {
        logger.error(`[error] Dropbox watcher error: ${error.message}`)
    })
    
    return watcher
}

/**
 * Start all watchers
 */
const startWatchers = () => {
    const gnomeWatcher = startGnomeWatcher()
    const dropboxWatcher = startDropboxWatcher()
    
    process.on('exit', () => {
        gnomeWatcher.close()
        dropboxWatcher.close()
    })
}

/**
 * Perform startup sync to handle wallpapers that appeared while app was offline
 */
const performStartupSync = async () => {
    try {
        logger.info('[info] Performing startup sync...')
        
        // Handle any unhandled wallpapers
        await handleDropboxWallpaperChange()
        
        logger.info('[info] Startup sync completed')
    } catch (error) {
        logger.error(`[error] Startup sync failed: ${error.message}`)
    }
}

/**
 * Initialize the application
 */
const initializeApp = async () => {
    try {
        await createDirectories()
        initializeLogger()
        await initializeConfig()
        
        logger.info('[info] Wallpaper Sync starting up')
        logger.info(`[info] Config directory: ${APP_CONFIG_DIR}`)
        logger.info(`[info] Log directory: ${APP_LOG_DIR}`)
        logger.info(`[info] Dropbox wallpaper directory: ${DROPBOX_WALLPAPER_DIR}`)
        
        await performStartupSync()
        startWatchers()
        
        logger.info('[info] Wallpaper Sync is now running')
        
    } catch (error) {
        console.error('[error] Failed to initialize application:', error.message)
        process.exit(1)
    }
}

/**
 * Main
 */
initializeApp().catch(error => {
    console.error('[error] Unhandled error:', error)
    process.exit(1)
})

process.on('SIGINT', () => {
    if (logger) {
        logger.info('[exit] Shutting down Wallpaper Sync')
    }
    process.exit(0)
})

process.on('SIGTERM', () => {
    if (logger) {
        logger.info('[exit] Shutting down Wallpaper Sync')
    }
    process.exit(0)
})
