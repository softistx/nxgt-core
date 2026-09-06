import {
	AccountNumberResolver,
	BigIntResolver,
	CountryCodeResolver,
	CountryNameResolver,
	CuidResolver,
	CurrencyResolver,
	DateResolver,
	DateTimeISOResolver,
	DurationResolver,
	EmailAddressResolver,
	GeoJSONResolver,
	GUIDResolver,
	HexadecimalResolver,
	HexColorCodeResolver,
	HSLAResolver,
	HSLResolver,
	IBANResolver,
	IPResolver,
	IPv4Resolver,
	IPv6Resolver,
	ISBNResolver,
	JSONObjectResolver,
	JSONResolver,
	JWTResolver,
	LatitudeResolver,
	LocaleResolver,
	LongitudeResolver,
	LongResolver,
	MACResolver,
	NegativeFloatResolver,
	NegativeIntResolver,
	NonEmptyStringResolver,
	NonNegativeFloatResolver,
	NonNegativeIntResolver,
	NonPositiveFloatResolver,
	NonPositiveIntResolver,
	ObjectIDResolver,
	PhoneNumberResolver,
	PortResolver,
	PositiveFloatResolver,
	PositiveIntResolver,
	PostalCodeResolver,
	RGBAResolver,
	RGBResolver,
	SESSNResolver,
	TimeResolver,
	TimestampResolver,
	URLResolver,
	USCurrencyResolver,
	UtcOffsetResolver,
	UUIDResolver,
	VoidResolver,
} from 'graphql-scalars';
import { createScalarFrom } from './utils';

export const CUSTOM_SCALARS = {
	AccountNumber: createScalarFrom(AccountNumberResolver, {
		errorMessage: 'validation.errors.invalid-account-number',
	}),
	BigInt: createScalarFrom(BigIntResolver, {
		errorMessage: 'validation.errors.invalid-big-int',
	}),
	CountryCode: createScalarFrom(CountryCodeResolver, {
		errorMessage: 'validation.errors.invalid-country-code',
	}),
	CountryName: createScalarFrom(CountryNameResolver, {
		errorMessage: 'validation.errors.invalid-country-name',
	}),
	Cuid: createScalarFrom(CuidResolver, {
		errorMessage: 'validation.errors.invalid-cuid',
	}),
	CurrencyCode: createScalarFrom(CurrencyResolver, {
		name: 'CurrencyCode',
		errorMessage: 'validation.errors.invalid-currency',
	}),
	Date: createScalarFrom(DateResolver, {
		errorMessage: 'validation.errors.invalid-date',
	}),
	DateTime: createScalarFrom(DateTimeISOResolver, {
		name: 'DateTime',
		errorMessage: 'validation.errors.invalid-date-time',
	}),
	Duration: createScalarFrom(DurationResolver, {
		errorMessage: 'validation.errors.invalid-duration',
	}),
	EmailAddress: createScalarFrom(EmailAddressResolver, {
		errorMessage: 'validation.errors.invalid-email-address',
	}),
	GeoJSON: createScalarFrom(GeoJSONResolver, {
		errorMessage: 'validation.errors.invalid-geo-json',
	}),
	GUID: createScalarFrom(GUIDResolver, {
		errorMessage: 'validation.errors.invalid-guid',
	}),
	HexColorCode: createScalarFrom(HexColorCodeResolver, {
		errorMessage: 'validation.errors.invalid-hex-color-code',
	}),
	Hexadecimal: createScalarFrom(HexadecimalResolver, {
		errorMessage: 'validation.errors.invalid-hexadecimal',
	}),
	HSL: createScalarFrom(HSLResolver, {
		errorMessage: 'validation.errors.invalid-hsl',
	}),
	HSLA: createScalarFrom(HSLAResolver, {
		errorMessage: 'validation.errors.invalid-hsla',
	}),
	IBAN: createScalarFrom(IBANResolver, {
		errorMessage: 'validation.errors.invalid-iban',
	}),
	IP: createScalarFrom(IPResolver, {
		errorMessage: 'validation.errors.invalid-ip',
	}),
	IPv4: createScalarFrom(IPv4Resolver, {
		errorMessage: 'validation.errors.invalid-ipv4',
	}),
	IPv6: createScalarFrom(IPv6Resolver, {
		errorMessage: 'validation.errors.invalid-ipv6',
	}),
	ISBN: createScalarFrom(ISBNResolver, {
		errorMessage: 'validation.errors.invalid-isbn',
	}),
	JSON: createScalarFrom(JSONResolver, {
		errorMessage: 'validation.errors.invalid-json',
	}),
	JSONObject: createScalarFrom(JSONObjectResolver, {
		errorMessage: 'validation.errors.invalid-json-object',
	}),
	JWT: createScalarFrom(JWTResolver, {
		errorMessage: 'validation.errors.invalid-jwt',
	}),
	Latitude: createScalarFrom(LatitudeResolver, {
		errorMessage: 'validation.errors.invalid-latitude',
	}),
	Locale: createScalarFrom(LocaleResolver, {
		errorMessage: 'validation.errors.invalid-locale',
	}),
	Longitude: createScalarFrom(LongitudeResolver, {
		errorMessage: 'validation.errors.invalid-longitude',
	}),
	Long: createScalarFrom(LongResolver, {
		errorMessage: 'validation.errors.invalid-long',
	}),
	MAC: createScalarFrom(MACResolver, {
		errorMessage: 'validation.errors.invalid-mac',
	}),
	NegativeFloat: createScalarFrom(NegativeFloatResolver, {
		errorMessage: 'validation.errors.invalid-negative-float',
	}),
	NegativeInt: createScalarFrom(NegativeIntResolver, {
		errorMessage: 'validation.errors.invalid-negative-int',
	}),
	NonEmptyString: createScalarFrom(NonEmptyStringResolver, {
		errorMessage: 'validation.errors.invalid-non-empty-string',
	}),
	NonNegativeFloat: createScalarFrom(NonNegativeFloatResolver, {
		errorMessage: 'validation.errors.invalid-non-negative-float',
	}),
	NonNegativeInt: createScalarFrom(NonNegativeIntResolver, {
		errorMessage: 'validation.errors.invalid-non-negative-int',
	}),
	NonPositiveFloat: createScalarFrom(NonPositiveFloatResolver, {
		errorMessage: 'validation.errors.invalid-non-positive-float',
	}),
	NonPositiveInt: createScalarFrom(NonPositiveIntResolver, {
		errorMessage: 'validation.errors.invalid-non-positive-int',
	}),
	ObjectID: createScalarFrom(ObjectIDResolver, {
		errorMessage: 'validation.errors.invalid-object-id',
	}),
	PhoneNumber: createScalarFrom(PhoneNumberResolver, {
		errorMessage: 'validation.errors.invalid-phone-number',
	}),
	Port: createScalarFrom(PortResolver, {
		errorMessage: 'validation.errors.invalid-port',
	}),
	PositiveFloat: createScalarFrom(PositiveFloatResolver, {
		errorMessage: 'validation.errors.invalid-positive-float',
	}),
	PositiveInt: createScalarFrom(PositiveIntResolver, {
		errorMessage: 'validation.errors.invalid-positive-int',
	}),
	PostalCode: createScalarFrom(PostalCodeResolver, {
		errorMessage: 'validation.errors.invalid-postal-code',
	}),
	RGB: createScalarFrom(RGBResolver, {
		errorMessage: 'validation.errors.invalid-rgb',
	}),
	RGBA: createScalarFrom(RGBAResolver, {
		errorMessage: 'validation.errors.invalid-rgba',
	}),
	SESSN: createScalarFrom(SESSNResolver, {
		errorMessage: 'validation.errors.invalid-sessn',
	}),
	Time: createScalarFrom(TimeResolver, {
		errorMessage: 'validation.errors.invalid-time',
	}),
	Timestamp: createScalarFrom(TimestampResolver, {
		errorMessage: 'validation.errors.invalid-timestamp',
	}),
	URL: createScalarFrom(URLResolver, {
		errorMessage: 'validation.errors.invalid-url',
	}),
	USCurrency: createScalarFrom(USCurrencyResolver, {
		errorMessage: 'validation.errors.invalid-us-currency',
	}),
	UTCOffset: createScalarFrom(UtcOffsetResolver, {
		errorMessage: 'validation.errors.invalid-utc-offset',
	}),
	UUID: createScalarFrom(UUIDResolver, {
		errorMessage: 'validation.errors.invalid-uuid',
	}),
	Void: createScalarFrom(VoidResolver, {
		errorMessage: 'validation.errors.invalid-void',
	}),
};
