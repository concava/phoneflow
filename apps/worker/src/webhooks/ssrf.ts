import { lookup as dnsLookup } from "node:dns"
import { BlockList, isIP, type LookupFunction } from "node:net"
import { Agent, type Dispatcher } from "undici"

const blockedIpv4Subnets: [string, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
]

// Azure's metadata and health endpoint is outside every reserved range.
const blockedIpv4Addresses = ["168.63.129.16"]

// Only 2000::/3 is global unicast, so everything else is refused. That covers
// ::1, fc00::/7, fe80::/10, ff00::/8, NAT64 and all of ::ffff:0:0/96. The rest
// is special-purpose space inside 2000::/3, including 6to4 and Teredo, which
// can tunnel to an embedded IPv4 address.
const blockedIpv6Subnets: [string, number][] = [
  ["::", 3],
  ["4000::", 2],
  ["8000::", 1],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["3fff::", 20],
]

// Kept apart because BlockList checks an IPv4 address against IPv6 rules as its
// mapped form, so one shared list would match all of IPv4 against ::/3.
const blockedIpv4 = new BlockList()
for (const [network, prefix] of blockedIpv4Subnets) {
  blockedIpv4.addSubnet(network, prefix, "ipv4")
}
for (const address of blockedIpv4Addresses) {
  blockedIpv4.addAddress(address, "ipv4")
}

const blockedIpv6 = new BlockList()
for (const [network, prefix] of blockedIpv6Subnets) {
  blockedIpv6.addSubnet(network, prefix, "ipv6")
}

export class BlockedAddressError extends Error {
  readonly code = "WEBHOOK_BLOCKED_ADDRESS"

  constructor() {
    super("Destination address is not allowed")
    this.name = "BlockedAddressError"
  }
}

export function isBlockedAddress(address: string) {
  const ip = address.split("%")[0]
  const family = isIP(ip)

  if (family === 0) {
    return true
  }

  return family === 4
    ? blockedIpv4.check(ip, "ipv4")
    : blockedIpv6.check(ip, "ipv6")
}

// The socket connects to the addresses returned here, so the addresses that
// were validated are the addresses used and DNS cannot rebind in between.
const publicOnlyLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (error, addresses) => {
    if (error) {
      callback(error, "", 0)
      return
    }

    if (
      addresses.length === 0 ||
      addresses.some(({ address }) => isBlockedAddress(address))
    ) {
      callback(new BlockedAddressError(), "", 0)
      return
    }

    if (options.all) {
      callback(null, addresses)
      return
    }

    callback(null, addresses[0].address, addresses[0].family)
  })
}

const publicOnlyDispatcher = new Agent({
  connect: { lookup: publicOnlyLookup },
})

const unrestrictedDispatcher = new Agent()

// Node never calls lookup for an IP literal, so those are checked up front.
export function guardWebhookUrl(
  url: URL,
  restrictNetwork: boolean
): Dispatcher {
  if (!restrictNetwork) {
    return unrestrictedDispatcher
  }

  const host = url.hostname.replace(/^\[|\]$/g, "")

  if (isIP(host) && isBlockedAddress(host)) {
    throw new BlockedAddressError()
  }

  return publicOnlyDispatcher
}
