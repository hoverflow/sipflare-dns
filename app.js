'use strict'
/* SIPFLARE-DNS
 * realtime DNS server for simplicity and speed
 * the server have a default hardcoded list of domain for speed-of-light resolution
 * postgresql database must contain a table (dns_domains) with two columns: servers and domain (character string)
 *  CREATE TABLE public.dns_domains
 *  (
 *    domain character varying COLLATE pg_catalog."default" NOT NULL,
 *    servers character varying COLLATE pg_catalog."default",
 *    CONSTRAINT "PK_A_1" PRIMARY KEY (domain)
 *  )
 *  WITH (
 *  	 OIDS = FALSE
 *  )
 *  TABLESPACE pg_default;
 *
 *  INSERT INTO public.dns_domains(domain, servers)	VALUES ('zerotest.com','{"list":["192.168.0.1","192.168.0.2"]}');
 */

const Client = require('pg').Client;
var cfg = require('./config.json');
var dns = require('native-dns');
var util = require('util');

const client = new Client(cfg);
client.connect((err) => {
	if (err) {
		console.error('connection error', err.stack)
	} else {
		console.log('connected');

	}
});

/* hardcoded DNS, used to fast reply pre-configured routes */
var defaultEntries = {
	'www.test.com': [{
		name: 'www.test.com',
		address: '127.0.0.1',
		ttl: 300
	}],
	'test.com': [{
		name: 'test.com',
		address: '127.0.0.1',
		ttl: 300
	}]
};


function getSubdomain(subdomain, callback) {
	let qry = 'select servers from dns_domains where domain = $1';
	let param = [subdomain];
	client.query(qry, param, (err, res) => {
		callback(err, res);
	});
}

function getDnsEntry(domain, address, ttl) {
	if (address) {
		return dns.A({
			name: domain,
			address: address,
			ttl: ttl
		});
	}
}

var server = dns.createServer();

server.on('request', function (request, response) {
	var subdomain = request.question[0].name;

	if (defaultEntries[subdomain]) {
		var entries = defaultEntries[subdomain];
		for (var i = 0; i < entries.length; i++) {
			var entry = entries[i];
			response.answer.push(dns.A(entry));
		}
		response.send();
	} else {

		getSubdomain(subdomain, function (err, data) {
			if (data.rowCount > 0) {
				let dataRow = data.rows[0];
				try {
					dataRow = JSON.parse(dataRow.servers);
					if (dataRow) {
						if (dataRow.list.length > 0) {
							for (var i = 0; i < dataRow.list.length; i++) {
								var entry = dataRow.list[i];
								console.log('entry', entry);
								response.answer.push(getDnsEntry(subdomain, entry, 5));
							}
							response.send();
							return;
						}
					}
				} catch (e) {
					console.error(e);
				}
			}
		});
	}
});

server.on('error', function (err, buff, req, res) {
	console.log(err.stack);
});

console.log('Listening on ' + 53);
server.serve(53);