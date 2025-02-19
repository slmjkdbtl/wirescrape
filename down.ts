import * as fs from "fs/promises"
import * as path from "path"
import { $ } from "bun"

function fail(msg) {
	console.error(msg)
	process.exit(1)
}

const ids = process.argv.slice(2)
const downloadsPath = path.resolve("./downloads")
const EE_SESSION = Bun.env["EE_SESSION"]
const READER_SESSION = Bun.env["READER_SESSION"]

if (!EE_SESSION) fail("requires env var EE_SESSION")
if (!READER_SESSION) fail("requires env var READER_SESSION")

const headers = {
	"Cookie": `enableKeystrokes=true; ee_session=${EE_SESSION}; _reader_session=${READER_SESSION}`,
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

async function downloadBook(id: string) {

	let lastBuf = null
	const files = []
	const pagesPath = path.join(downloadsPath, id)

	async function downloadPage(page: number) {
		const url = `https://reader.exacteditions.com/issues/${id}/spread/${page * 2 - 1}.pdf`
		const fname = `${String(page).padStart(3, "0")}.pdf`
		const dest = path.join(pagesPath, fname)
		process.stdout.write(`fetching ${id}/${fname}... `)
		const res = await fetch(url, {
			headers: headers,
		})
		if (!res.ok) {
			if (res.status === 429) {
				console.log("\nhit load control, retry in 90 sec...")
				await Bun.sleep(90000)
				await downloadPage(page)
				return
			} else {
				console.log(res)
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
		files.push(dest)
		process.stdout.write(`done\n`)
		await downloadPage(page + 1)
	}

	await fs.mkdir(pagesPath, { recursive: true })
	await downloadPage(1)
	// await $`qpdf --empty --pages ${files.join(" ")} -- ${downloadsPath}/${id}.pdf`
	// await fs.rm(pagesPath, { recursive: true, force: true })

}

for (const id of ids) {
	await downloadBook(id)
}
