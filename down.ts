import * as fs from "fs/promises"
import { promisify } from "util"
import * as path from "path"
import { exec } from "child_process"
import data from "./id.json"

const execPromise = promisify(exec)

function die(msg) {
	console.error(msg)
	process.exit(1)
}

const issues = process.argv.slice(2)
const downloadsPath = path.resolve("./downloads")
const bookdir = Bun.env["DEST"]
	? Bun.env["DEST"].replaceAll("~", Bun.env["HOME"])
	: downloadsPath
const EE_SESSION = Bun.env["EE_SESSION"]
const READER_SESSION = Bun.env["READER_SESSION"]
const map = new Map(Object.entries(data).sort())

if (!EE_SESSION) die("requires env var EE_SESSION")
if (!READER_SESSION) die("requires env var READER_SESSION")
if (!Bun.which("pdfimages")) die("requires pdfimages from poppler")
if (!Bun.which("img2pdf")) die("requires img2pdf")

const headers = {
	"Cookie": `enableKeystrokes=true; ee_session=${EE_SESSION}; _reader_session=${READER_SESSION}`,
	"User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/133.0.0.0 Safari/537.36",
}

function compareArrayBuffers(buf1, buf2) {
	if (buf1.byteLength !== buf2.byteLength) return false
	const view1 = new Uint8Array(buf1)
	const view2 = new Uint8Array(buf2)
	for (let i = 0; i < buf1.byteLength; i++) {
		if (view1[i] !== view2[i]) return false
	}
	return true
}

export async function downloadBook(issue: string) {

	const id = map.get(issue)

	if (!id) {
		console.error(`issue not found: ${issue}`)
		return
	}

	const pagesPath = path.join(downloadsPath, issue)
	let lastBuf = null
	let failed = false

	async function downloadPage(page: number) {
		const url = `https://reader.exacteditions.com/issues/${id}/spread/${page * 2 - 1}.pdf`
		const pageName = String(page).padStart(3, "0")
		const fileName = `${pageName}.pdf`
		const dest = path.join(pagesPath, fileName)
		process.stdout.write(`fetching ${issue}/${fileName}... `)
		const res = await fetch(url, {
			headers: headers,
		})
		if (!res.ok) {
			if (res.status === 429) {
				console.log("\nhit rate limit, retry in 120 sec...")
				await Bun.sleep(120000)
				await downloadPage(page)
				return
			} else {
				die(`\b${res.status} ${res.statusText}`)
				return
			}
		}
		const buf = await res.arrayBuffer()
		if (lastBuf) {
			if (compareArrayBuffers(buf, lastBuf)) {
				process.stdout.write(`\n`)
				return
			}
		}
		lastBuf = buf
		await Bun.write(dest, buf)
		await execPromise(`pdfimages -all ${dest} ${pagesPath}/${pageName}`)
		await fs.rm(dest)
		process.stdout.write(`done\n`)
		await Bun.sleep(1000)
		await downloadPage(page + 1)
	}

	const dest = path.join(bookdir, `${issue}.pdf`)

	await fs.mkdir(pagesPath, { recursive: true })
	await downloadPage(1)

	if (!failed) {
		await execPromise(`img2pdf ${pagesPath}/*.jpg -o ${dest}`)
		console.log(`issue ${issue} saved to ${dest}`)
	}

	await fs.rm(pagesPath, { recursive: true, force: true })

}

if (issues.length === 0) {
	for (let [issue, id] of map) {
		const f = Bun.file(`${bookdir}/${issue}.pdf`)
		if (await f.exists()) continue
		await downloadBook(issue)
	}
} else {
	for (const issue of issues) {
		await downloadBook(issue)
	}
}
