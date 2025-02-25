import { chromium } from "playwright"

const map = {}

const browser = await chromium.launch()
const ctx = await browser.newContext()

async function find(url: string) {

	console.log(`searching under ${url}`)
	const page = await ctx.newPage()
	await page.goto(url, { waitUntil: "load" })

	const covers = await page.locator("magazine-cover").all()

	for (const cover of covers) {
		const issue = await cover.getAttribute("issue")
		const path = await cover.getAttribute("path")
		const { id, name }: { id: number, name: string } = JSON.parse(issue)
		if (path.endsWith("spread/1")) {
			const num = name
				.match(/\(issues?\s(?<num>.+)\)/i)
				?.groups["num"]
				.split(" ")
				.join("")
				.replaceAll("/", "+")
				.split("+")
				.map((n) => n.padStart(3, "0"))
				.join("+")
			map[num] = id
			console.log(`${num}: ${id}`)
		}
	}

	await page.close()

}

const d = new Date()

for (let i = 1982; i <= d.getFullYear(); i++) {
	await find(`https://reader.exacteditions.com/magazines/493/issues/${i}`)
}

await browser.close()

Bun.write("id.json", JSON.stringify(map, null, 4))
